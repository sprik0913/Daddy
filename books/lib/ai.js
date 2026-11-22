'use strict';
// Optional: ask Claude to categorize bank lines that rules and history could not.
// Needs `npm install` (for @anthropic-ai/sdk) and an Anthropic API key in Settings or ANTHROPIC_API_KEY.
// Without them, everything else still works.
const MODEL = 'claude-opus-5-5';

function loadSDK() {
  try { return require('@anthropic-ai/sdk'); } catch { return null; }
}

function status(apiKey) {
  const sdk = loadSDK();
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  return { sdkInstalled: !!sdk, hasKey: !!key, enabled: !!(sdk && key), model: MODEL };
}

const SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          account_id: { type: ['integer', 'null'] },
          payee: { type: 'string' },
        },
        required: ['id', 'account_id', 'payee'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
};

// txns: [{id, date, amount (cents), description}], accounts: [{id, name, type, subtype}]
async function categorize({ apiKey, companyName, txns, accounts, examples }) {
  const sdk = loadSDK();
  if (!sdk) throw Object.assign(new Error('AI is not installed. Run "npm install" in the books folder.'), { status: 400 });
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw Object.assign(new Error('Add an Anthropic API key in Settings to use AI categorizing.'), { status: 400 });
  const Anthropic = sdk.default || sdk;
  const client = new Anthropic({ apiKey: key });

  const chart = accounts.map((a) => `${a.id}\t${a.name}\t${a.subtype}`).join('\n');
  const ex = (examples || []).slice(0, 60).map((e) => `${e.description}\t${(e.amount / 100).toFixed(2)}\t-> ${e.account_id} ${e.account_name}`).join('\n');
  const lines = txns.map((t) => `${t.id}\t${t.date}\t${(t.amount / 100).toFixed(2)}\t${t.description}`).join('\n');

  const prompt = `You are the bookkeeper for "${companyName}", a small US business.
Categorize each bank/credit-card line below into one account from the chart of accounts.
Positive amounts are money coming in; negative amounts are money going out.
Use income accounts for money in from sales, expense/COGS accounts for purchases, and balance-sheet accounts
(e.g. another bank, a credit card, a loan, owner draws/equity) for transfers, card payments, loan payments and owner money.
If you cannot tell with reasonable confidence, return null for account_id.
For payee, give a short clean vendor/customer name (e.g. "Home Depot", "Verizon"), or "" if unclear.

Chart of accounts (id, name, type):
${chart}

How this business has categorized similar lines before:
${ex || '(none yet)'}

Lines to categorize (id, date, amount, description):
${lines}`;

  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  });
  if (res.stop_reason === 'refusal') throw Object.assign(new Error('The AI declined this request.'), { status: 502 });
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw Object.assign(new Error('The AI returned an unreadable answer. Try again.'), { status: 502 }); }
  const valid = new Set(accounts.map((a) => a.id));
  return (parsed.results || []).filter((r) => r.account_id === null || valid.has(r.account_id));
}

module.exports = { status, categorize, MODEL };
