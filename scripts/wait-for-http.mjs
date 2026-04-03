import process from 'node:process';

const url = process.argv[2];
const timeoutSeconds = Number(process.argv[3] ?? '120');

if (!url) {
  process.stderr.write('Usage: node scripts/wait-for-http.mjs <url> [timeoutSeconds]\n');
  process.exit(1);
}

const deadline = Date.now() + (timeoutSeconds * 1000);

async function main() {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        process.stdout.write(`Ready: ${url}\n`);
        return;
      }
    } catch {
      // keep retrying until deadline
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
