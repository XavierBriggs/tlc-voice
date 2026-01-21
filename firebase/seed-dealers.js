// seed-dealers.js
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (getApps().length === 0) {
  const serviceAccountPath = join(__dirname, 'hestia-service-account.json');
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

async function seedDealers() {
  // Sample dealers
  const dealers = [
    {
      dealer_id: 'dlr_12345',
      dealer_name: 'ABC Homes of Missouri',
      status: 'active',
      primary_contact_email: 'sales@abchomes.example.com',
      primary_contact_phone: '+13145551000',
      lead_delivery_method: 'email', // email, webhook, portal
      daily_lead_cap: 10,
      priority_weight: 100,
      coverage_zips: ['63110', '63111', '63112', '63130', '63131'],
      created_at: new Date(),
    },
    {
      dealer_id: 'dlr_67890',
      dealer_name: 'Texas Mobile Homes',
      status: 'active',
      primary_contact_email: 'leads@txmobile.example.com',
      primary_contact_phone: '+12145552000',
      lead_delivery_method: 'webhook',
      webhook_url: 'https://txmobile.example.com/api/leads',
      daily_lead_cap: 15,
      priority_weight: 80,
      coverage_zips: ['75001', '75002', '75006', '75007'],
      created_at: new Date(),
    },
  ];

  // Tracking numbers (for dealer_phone attribution)
  const trackingNumbers = [
    {
      tracking_number: '+18005551234',
      dealer_id: 'dlr_12345',
      status: 'active',
      created_at: new Date(),
    },
    {
      tracking_number: '+18005555678',
      dealer_id: 'dlr_67890',
      status: 'active',
      created_at: new Date(),
    },
  ];

  console.log('Seeding dealers...');
  for (const dealer of dealers) {
    await db.collection('dealers').doc(dealer.dealer_id).set(dealer);
    console.log(`  ✓ ${dealer.dealer_name} (${dealer.dealer_id})`);
  }

  console.log('\nSeeding tracking numbers...');
  for (const tn of trackingNumbers) {
    await db.collection('dealerTrackingNumbers').doc(tn.tracking_number).set(tn);
    console.log(`  ✓ ${tn.tracking_number} → ${tn.dealer_id}`);
  }

  console.log('\n✅ Done! Firestore structure:');
  console.log(`
  dealers/
    └── dlr_12345/
          ├── dealer_name: "ABC Homes of Missouri"
          ├── status: "active"
          ├── coverage_zips: ["63110", "63111", ...]
          └── ...
    └── dlr_67890/
          └── ...

  dealerTrackingNumbers/
    └── +18005551234/
          ├── dealer_id: "dlr_12345"
          └── status: "active"
    └── +18005555678/
          └── ...
  `);
}

seedDealers().catch(console.error);