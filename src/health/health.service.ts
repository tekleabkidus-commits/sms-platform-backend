import { Injectable } from '@nestjs/common';
import { MetricsService } from '../common/metrics/metrics.service';
import { DatabaseService } from '../database/database.service';
import { KafkaService } from '../kafka/kafka.service';
import { RedisService } from '../redis/redis.service';
import { RuntimeRoleService } from '../runtime/runtime-role.service';

type DependencyState = 'up' | 'down';

interface DependencyResult {
  state: DependencyState;
  message?: string;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly kafkaService: KafkaService,
    private readonly runtimeRoleService: RuntimeRoleService,
    private readonly metricsService: MetricsService,
  ) {}

  getLiveness(): Record<string, unknown> {
    return {
      status: 'ok',
      role: this.runtimeRoleService.getRole(),
      environment: this.runtimeRoleService.getEnvironment(),
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  async getReadiness(): Promise<Record<string, unknown>> {
    const [database, redis, kafka] = await Promise.all([
      this.checkDependency(() => this.databaseService.ping(), 'database'),
      this.checkDependency(() => this.redisService.ping(), 'redis'),
      this.checkDependency(async () => {
        const health = this.kafkaService.getHealth();
        if (!health.producerConnected) {
          throw new Error('Kafka producer is not connected');
        }

        const role = this.runtimeRoleService.getRole();
        if (
          ['worker-dispatch', 'worker-dlr', 'worker-fraud', 'worker-reconciliation'].includes(role)
          && health.connectedConsumers === 0
        ) {
          throw new Error('Kafka consumer subscriptions are not connected');
        }
      }, 'kafka'),
    ]);

    const ready = [database, redis, kafka].every((dependency) => dependency.state === 'up');
    this.metricsService.setDependencyState('database', database.state === 'up');
    this.metricsService.setDependencyState('redis', redis.state === 'up');
    this.metricsService.setDependencyState('kafka', kafka.state === 'up');
    return {
      status: ready ? 'ready' : 'degraded',
      ready,
      role: this.runtimeRoleService.getRole(),
      environment: this.runtimeRoleService.getEnvironment(),
      capabilities: this.runtimeRoleService.describeCapabilities(),
      dependencies: {
        database,
        redis,
        kafka: {
          ...kafka,
          details: this.kafkaService.getHealth(),
        },
      },
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  private async checkDependency(probe: () => Promise<void>, _name: string): Promise<DependencyResult> {
    try {
      await probe();
      return { state: 'up' };
    } catch (error) {
      return {
        state: 'down',
        message: error instanceof Error ? error.message : 'unknown error',
      };
    }
  }
}
