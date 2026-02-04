// Quick script to check CLOB API market counts
async function check() {
  const res = await fetch('https://clob.polymarket.com/markets');
  const json = await res.json() as { data: any[] };
  const markets = json.data || json;

  console.log('Total markets:', markets.length);
  console.log('Active:', markets.filter((m: any) => m.active === true).length);
  console.log('Not closed:', markets.filter((m: any) => m.closed === false).length);
  console.log('Accepting orders:', markets.filter((m: any) => m.accepting_orders === true).length);

  // Check a few markets to understand the data
  const notClosed = markets.filter((m: any) => m.closed === false);
  if (notClosed.length > 0) {
    const ex = notClosed[0];
    console.log('\nNot-closed market example:');
    console.log('  Question:', ex.question?.slice(0, 60));
    console.log('  Active:', ex.active);
    console.log('  Closed:', ex.closed);
    console.log('  Accepting:', ex.accepting_orders);
  }

  const active = markets.filter((m: any) => m.active === true);
  if (active.length > 0) {
    const ex = active[0];
    console.log('\nActive market example:');
    console.log('  Question:', ex.question?.slice(0, 60));
    console.log('  Active:', ex.active);
    console.log('  Closed:', ex.closed);
    console.log('  Accepting:', ex.accepting_orders);
    console.log('  Tokens:', ex.tokens?.length);
    if (ex.tokens?.[0]) {
      console.log('  Token ID:', ex.tokens[0].token_id?.slice(0, 20) + '...');
    }
  }
}

check().catch(console.error);
