/**
 * Dev helper (B2): dump raw AUTO.RIA responses so we can verify field mappings.
 * Run:  npx ts-node --transpile-only scripts/dump-auto-ria.ts <markId> <modelId> [categoryId]
 * Needs AUTO_RIA_API_KEY in .env. Not part of the build (scripts/ is outside tsconfig include).
 */
import 'dotenv/config';
import { request } from 'undici';

const BASE = 'https://developers.ria.com/auto';
const key = process.env.AUTO_RIA_API_KEY ?? '';

async function get(path: string, params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams({ api_key: key, ...params });
  const url = `${BASE}${path}?${qs.toString()}`;
  const { statusCode, body } = await request(url);
  const json: unknown = await body.json();
  const safeUrl = url.replace(key, '***');
  console.log(`\n===== ${path} (HTTP ${statusCode}) =====`);
  console.log(safeUrl);
  console.log(JSON.stringify(json, null, 2));
  return json;
}

async function main(): Promise<void> {
  if (!key) {
    console.error('Set AUTO_RIA_API_KEY in .env');
    process.exit(1);
  }
  const [markId = '9', modelId = '96', categoryId = '1'] = process.argv.slice(2);

  const search = (await get('/search', {
    category_id: categoryId,
    'marka_id[]': markId,
    'model_id[]': modelId,
    countpage: '3',
  })) as { result?: { search_result?: { ids?: string[] } } };

  const ids = search.result?.search_result?.ids ?? [];
  console.log('\nParsed ids (our current mapping):', ids);

  if (ids[0]) {
    await get('/info', { auto_id: ids[0] });
  } else {
    console.log('\n(no ids parsed — the search response shape differs; the raw dump above is what matters)');
  }

  await get('/average_price', { marka_id: markId, model_id: modelId });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
