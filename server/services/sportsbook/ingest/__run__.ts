import { ingestOdds } from './ingestOdds';
import { ingestScores } from './ingestScores';

async function main() {
  const command = process.argv[2];
  if (command === 'ingestOdds') {
    await ingestOdds();
  } else if (command === 'ingestScores') {
    await ingestScores();
  } else {
    console.error('Usage: tsx __run__.ts <ingestOdds|ingestScores>');
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
