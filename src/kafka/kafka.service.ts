import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, Kafka, Producer, ProducerRecord, SASLOptions } from 'kafkajs';
import { MetricsService } from '../common/metrics/metrics.service';

@Injectable()
export class KafkaService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(KafkaService.name);
  private readonly kafka: Kafka;
  private readonly producer: Producer;
  private readonly consumers: Consumer[] = [];
  private producerConnected = false;
  private shuttingDown = false;
  private readonly consumerHealth = new Map<string, { topic: string; connected: boolean }>();

  constructor(
    configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    const saslMechanism = configService.get<string>('kafka.saslMechanism');
    const sasl = saslMechanism ? ({
      mechanism: saslMechanism as SASLOptions['mechanism'],
      username: configService.getOrThrow<string>('kafka.saslUsername'),
      password: configService.getOrThrow<string>('kafka.saslPassword'),
    } as SASLOptions) : undefined;

    this.kafka = new Kafka({
      clientId: configService.getOrThrow<string>('kafka.clientId'),
      brokers: configService.getOrThrow<string[]>('kafka.brokers'),
      ssl: configService.get<boolean>('kafka.ssl'),
      sasl,
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: false,
      idempotent: true,
      maxInFlightRequests: 1,
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.producer.connect();
    this.producerConnected = true;
  }

  async publish(record: ProducerRecord): Promise<void> {
    try {
      await this.producer.send(record);
      this.metricsService.recordKafkaMessage(record.topic, 'produce', 'success');
    } catch (error) {
      this.metricsService.recordKafkaMessage(record.topic, 'produce', 'error');
      throw error;
    }
  }

  async subscribe(
    topic: string,
    groupId: string,
    onMessage: (message: { topic: string; key: string | null; value: string }) => Promise<void>,
  ): Promise<void> {
    const consumer = this.kafka.consumer({ groupId });
    const healthKey = `${groupId}:${topic}`;
    await consumer.connect();
    this.consumerHealth.set(healthKey, { topic, connected: true });
    await consumer.subscribe({ topic, fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ topic: messageTopic, message }) => {
        const payload = {
          topic: messageTopic,
          key: message.key?.toString() ?? null,
          value: message.value?.toString() ?? '',
        };

        try {
          await onMessage(payload);
          this.metricsService.recordKafkaMessage(messageTopic, 'consume', 'success');
        } catch (error) {
          this.metricsService.recordKafkaMessage(messageTopic, 'consume', 'error');
          throw error;
        }
      },
    });
    this.consumers.push(consumer);
  }

  getHealth(): { producerConnected: boolean; connectedConsumers: number; totalConsumers: number; shuttingDown: boolean } {
    return {
      producerConnected: this.producerConnected,
      connectedConsumers: [...this.consumerHealth.values()].filter((entry) => entry.connected).length,
      totalConsumers: this.consumerHealth.size,
      shuttingDown: this.shuttingDown,
    };
  }

  async onApplicationShutdown(): Promise<void> {
    this.logger.log('Closing Kafka connections');
    this.shuttingDown = true;
    await Promise.all(this.consumers.map(async (consumer) => {
      await consumer.stop();
      await consumer.disconnect();
    }));
    for (const key of this.consumerHealth.keys()) {
      this.consumerHealth.set(key, {
        ...(this.consumerHealth.get(key) ?? { topic: key, connected: false }),
        connected: false,
      });
    }
    await this.producer.disconnect();
    this.producerConnected = false;
  }
}
