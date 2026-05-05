import { settleBets } from './settleBets';

async function main() {
  await settleBets();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
