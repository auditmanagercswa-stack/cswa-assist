// Static reference data for seeding: Indian locations (Kerala-first) and an Indian vehicle catalogue.

export const STATES: { name: string; code: string; priority?: number; districts: { name: string; cities: [string, string][] }[] }[] = [
  {
    name: "Kerala",
    code: "KL",
    priority: 100,
    districts: [
      { name: "Thiruvananthapuram", cities: [["Thiruvananthapuram", "695001"], ["Neyyattinkara", "695121"], ["Attingal", "695101"]] },
      { name: "Kollam", cities: [["Kollam", "691001"], ["Karunagappally", "690518"]] },
      { name: "Pathanamthitta", cities: [["Pathanamthitta", "689645"], ["Thiruvalla", "689101"]] },
      { name: "Alappuzha", cities: [["Alappuzha", "688001"], ["Cherthala", "688524"], ["Kayamkulam", "690502"]] },
      { name: "Kottayam", cities: [["Kottayam", "686001"], ["Pala", "686575"], ["Changanassery", "686101"]] },
      { name: "Idukki", cities: [["Thodupuzha", "685584"], ["Kattappana", "685508"]] },
      { name: "Ernakulam", cities: [["Kochi", "682001"], ["Kakkanad", "682030"], ["Aluva", "683101"], ["Perumbavoor", "683542"], ["Muvattupuzha", "686661"]] },
      { name: "Thrissur", cities: [["Thrissur", "680001"], ["Chalakudy", "680307"], ["Guruvayur", "680101"]] },
      { name: "Palakkad", cities: [["Palakkad", "678001"], ["Ottapalam", "679101"]] },
      { name: "Malappuram", cities: [["Malappuram", "676505"], ["Manjeri", "676121"], ["Tirur", "676101"], ["Perinthalmanna", "679322"]] },
      { name: "Kozhikode", cities: [["Kozhikode", "673001"], ["Vadakara", "673101"]] },
      { name: "Wayanad", cities: [["Kalpetta", "673121"], ["Sulthan Bathery", "673592"]] },
      { name: "Kannur", cities: [["Kannur", "670001"], ["Thalassery", "670101"]] },
      { name: "Kasaragod", cities: [["Kasaragod", "671121"], ["Kanhangad", "671315"]] },
    ],
  },
  { name: "Karnataka", code: "KA", priority: 50, districts: [{ name: "Bengaluru Urban", cities: [["Bengaluru", "560001"], ["Whitefield", "560066"]] }, { name: "Mysuru", cities: [["Mysuru", "570001"]] }, { name: "Dakshina Kannada", cities: [["Mangaluru", "575001"]] }] },
  { name: "Tamil Nadu", code: "TN", priority: 50, districts: [{ name: "Chennai", cities: [["Chennai", "600001"]] }, { name: "Coimbatore", cities: [["Coimbatore", "641001"]] }, { name: "Kanyakumari", cities: [["Nagercoil", "629001"]] }] },
  { name: "Maharashtra", code: "MH", priority: 40, districts: [{ name: "Mumbai Suburban", cities: [["Mumbai", "400001"], ["Andheri", "400053"]] }, { name: "Pune", cities: [["Pune", "411001"]] }] },
  { name: "Delhi", code: "DL", priority: 40, districts: [{ name: "New Delhi", cities: [["New Delhi", "110001"]] }, { name: "South Delhi", cities: [["Saket", "110017"]] }] },
  { name: "Telangana", code: "TS", priority: 30, districts: [{ name: "Hyderabad", cities: [["Hyderabad", "500001"]] }] },
  { name: "Andhra Pradesh", code: "AP", districts: [{ name: "Visakhapatnam", cities: [["Visakhapatnam", "530001"]] }] },
  { name: "Gujarat", code: "GJ", districts: [{ name: "Ahmedabad", cities: [["Ahmedabad", "380001"]] }] },
  { name: "Rajasthan", code: "RJ", districts: [{ name: "Jaipur", cities: [["Jaipur", "302001"]] }] },
  { name: "Uttar Pradesh", code: "UP", districts: [{ name: "Lucknow", cities: [["Lucknow", "226001"]] }, { name: "Gautam Buddha Nagar", cities: [["Noida", "201301"]] }] },
  { name: "West Bengal", code: "WB", districts: [{ name: "Kolkata", cities: [["Kolkata", "700001"]] }] },
  { name: "Punjab", code: "PB", districts: [{ name: "Ludhiana", cities: [["Ludhiana", "141001"]] }] },
  { name: "Haryana", code: "HR", districts: [{ name: "Gurugram", cities: [["Gurugram", "122001"]] }] },
  { name: "Madhya Pradesh", code: "MP", districts: [{ name: "Indore", cities: [["Indore", "452001"]] }] },
  { name: "Goa", code: "GA", districts: [{ name: "North Goa", cities: [["Panaji", "403001"]] }] },
  { name: "Odisha", code: "OD", districts: [{ name: "Khordha", cities: [["Bhubaneswar", "751001"]] }] },
  { name: "Bihar", code: "BR", districts: [{ name: "Patna", cities: [["Patna", "800001"]] }] },
  { name: "Assam", code: "AS", districts: [{ name: "Kamrup Metropolitan", cities: [["Guwahati", "781001"]] }] },
  { name: "Jharkhand", code: "JH", districts: [{ name: "Ranchi", cities: [["Ranchi", "834001"]] }] },
  { name: "Chhattisgarh", code: "CG", districts: [{ name: "Raipur", cities: [["Raipur", "492001"]] }] },
  { name: "Uttarakhand", code: "UK", districts: [{ name: "Dehradun", cities: [["Dehradun", "248001"]] }] },
  { name: "Himachal Pradesh", code: "HP", districts: [{ name: "Shimla", cities: [["Shimla", "171001"]] }] },
  { name: "Jammu and Kashmir", code: "JK", districts: [{ name: "Srinagar", cities: [["Srinagar", "190001"]] }] },
  { name: "Puducherry", code: "PY", districts: [{ name: "Puducherry", cities: [["Puducherry", "605001"]] }] },
  { name: "Chandigarh", code: "CH", districts: [{ name: "Chandigarh", cities: [["Chandigarh", "160017"]] }] },
  { name: "Tripura", code: "TR", districts: [{ name: "West Tripura", cities: [["Agartala", "799001"]] }] },
  { name: "Meghalaya", code: "ML", districts: [{ name: "East Khasi Hills", cities: [["Shillong", "793001"]] }] },
  { name: "Manipur", code: "MN", districts: [{ name: "Imphal West", cities: [["Imphal", "795001"]] }] },
  { name: "Mizoram", code: "MZ", districts: [{ name: "Aizawl", cities: [["Aizawl", "796001"]] }] },
  { name: "Nagaland", code: "NL", districts: [{ name: "Kohima", cities: [["Kohima", "797001"]] }] },
  { name: "Arunachal Pradesh", code: "AR", districts: [{ name: "Papum Pare", cities: [["Itanagar", "791111"]] }] },
  { name: "Sikkim", code: "SK", districts: [{ name: "Gangtok", cities: [["Gangtok", "737101"]] }] },
  { name: "Ladakh", code: "LA", districts: [{ name: "Leh", cities: [["Leh", "194101"]] }] },
  { name: "Andaman and Nicobar Islands", code: "AN", districts: [{ name: "South Andaman", cities: [["Port Blair", "744101"]] }] },
  { name: "Dadra and Nagar Haveli and Daman and Diu", code: "DN", districts: [{ name: "Daman", cities: [["Daman", "396210"]] }] },
  { name: "Lakshadweep", code: "LD", districts: [{ name: "Lakshadweep", cities: [["Kavaratti", "682555"]] }] },
];

type V = [name: string, fuel: "PETROL" | "DIESEL" | "CNG" | "ELECTRIC" | "HYBRID", trans: "MANUAL" | "AUTOMATIC" | "AMT" | "CVT" | "DCT", newPrice: number];
type M = { name: string; body: "HATCHBACK" | "SEDAN" | "SUV" | "MUV" | "COUPE" | "CONVERTIBLE" | "PICKUP" | "COMMERCIAL"; variants: V[] };

export const CATALOG: { name: string; luxury?: boolean; popular?: boolean; models: M[] }[] = [
  {
    name: "Maruti Suzuki",
    popular: true,
    models: [
      { name: "Swift", body: "HATCHBACK", variants: [["VXI", "PETROL", "MANUAL", 720000], ["ZXI Plus AMT", "PETROL", "AMT", 900000], ["VXI CNG", "CNG", "MANUAL", 820000]] },
      { name: "Baleno", body: "HATCHBACK", variants: [["Delta", "PETROL", "MANUAL", 780000], ["Alpha AMT", "PETROL", "AMT", 990000]] },
      { name: "Wagon R", body: "HATCHBACK", variants: [["LXI CNG", "CNG", "MANUAL", 620000], ["ZXI AMT", "PETROL", "AMT", 700000]] },
      { name: "Dzire", body: "SEDAN", variants: [["VXI", "PETROL", "MANUAL", 780000], ["ZXI Plus AMT", "PETROL", "AMT", 960000]] },
      { name: "Brezza", body: "SUV", variants: [["VXI", "PETROL", "MANUAL", 1050000], ["ZXI Plus AT", "PETROL", "AUTOMATIC", 1390000]] },
      { name: "Ertiga", body: "MUV", variants: [["VXI", "PETROL", "MANUAL", 1050000], ["ZXI CNG", "CNG", "MANUAL", 1250000]] },
      { name: "Grand Vitara", body: "SUV", variants: [["Zeta Plus Hybrid", "HYBRID", "CVT", 1900000], ["Alpha", "PETROL", "MANUAL", 1600000]] },
      { name: "Eeco", body: "COMMERCIAL", variants: [["Cargo CNG", "CNG", "MANUAL", 620000]] },
    ],
  },
  {
    name: "Hyundai",
    popular: true,
    models: [
      { name: "i20", body: "HATCHBACK", variants: [["Asta", "PETROL", "MANUAL", 1000000], ["Asta (O) IVT", "PETROL", "CVT", 1180000]] },
      { name: "Venue", body: "SUV", variants: [["SX", "PETROL", "MANUAL", 1150000], ["SX (O) Turbo DCT", "PETROL", "DCT", 1400000]] },
      { name: "Creta", body: "SUV", variants: [["SX", "PETROL", "MANUAL", 1550000], ["SX (O) Diesel AT", "DIESEL", "AUTOMATIC", 2000000]] },
      { name: "Verna", body: "SEDAN", variants: [["SX", "PETROL", "MANUAL", 1350000], ["SX (O) Turbo DCT", "PETROL", "DCT", 1750000]] },
      { name: "Alcazar", body: "MUV", variants: [["Platinum Diesel AT", "DIESEL", "AUTOMATIC", 2150000]] },
    ],
  },
  {
    name: "Tata",
    popular: true,
    models: [
      { name: "Tiago", body: "HATCHBACK", variants: [["XZ Plus", "PETROL", "MANUAL", 720000], ["XZ CNG", "CNG", "MANUAL", 800000]] },
      { name: "Altroz", body: "HATCHBACK", variants: [["XZ", "PETROL", "MANUAL", 900000], ["XZ Diesel", "DIESEL", "MANUAL", 1050000]] },
      { name: "Punch", body: "SUV", variants: [["Accomplished", "PETROL", "MANUAL", 820000], ["Creative AMT", "PETROL", "AMT", 960000]] },
      { name: "Nexon", body: "SUV", variants: [["XZ Plus", "PETROL", "MANUAL", 1250000], ["XZA Plus Diesel", "DIESEL", "AMT", 1450000]] },
      { name: "Nexon EV", body: "SUV", variants: [["Empowered LR", "ELECTRIC", "AUTOMATIC", 1750000]] },
      { name: "Harrier", body: "SUV", variants: [["XZA Plus", "DIESEL", "AUTOMATIC", 2350000], ["XZ", "DIESEL", "MANUAL", 2000000]] },
      { name: "Ace Gold", body: "COMMERCIAL", variants: [["Petrol CX", "PETROL", "MANUAL", 520000]] },
    ],
  },
  {
    name: "Mahindra",
    popular: true,
    models: [
      { name: "XUV700", body: "SUV", variants: [["AX7 Diesel AT", "DIESEL", "AUTOMATIC", 2500000], ["AX5", "PETROL", "MANUAL", 1950000]] },
      { name: "Scorpio-N", body: "SUV", variants: [["Z8 L Diesel", "DIESEL", "MANUAL", 2250000], ["Z8 Diesel AT", "DIESEL", "AUTOMATIC", 2350000]] },
      { name: "Thar", body: "SUV", variants: [["LX Hard Top Diesel", "DIESEL", "MANUAL", 1650000], ["LX Petrol AT", "PETROL", "AUTOMATIC", 1700000]] },
      { name: "XUV 3XO", body: "SUV", variants: [["AX5", "PETROL", "MANUAL", 1150000]] },
      { name: "Bolero Pik-Up", body: "PICKUP", variants: [["1.7 XL", "DIESEL", "MANUAL", 1000000]] },
    ],
  },
  {
    name: "Toyota",
    popular: true,
    models: [
      { name: "Innova Crysta", body: "MUV", variants: [["2.4 VX", "DIESEL", "MANUAL", 2400000], ["2.4 ZX", "DIESEL", "MANUAL", 2650000]] },
      { name: "Innova Hycross", body: "MUV", variants: [["ZX Hybrid", "HYBRID", "CVT", 3000000]] },
      { name: "Fortuner", body: "SUV", variants: [["4x2 Diesel AT", "DIESEL", "AUTOMATIC", 4100000], ["Legender 4x4", "DIESEL", "AUTOMATIC", 4800000]] },
      { name: "Glanza", body: "HATCHBACK", variants: [["V", "PETROL", "MANUAL", 900000]] },
      { name: "Urban Cruiser Hyryder", body: "SUV", variants: [["V Hybrid", "HYBRID", "CVT", 1950000]] },
      { name: "Hilux", body: "PICKUP", variants: [["High 4x4 AT", "DIESEL", "AUTOMATIC", 3900000]] },
    ],
  },
  {
    name: "Honda",
    models: [
      { name: "City", body: "SEDAN", variants: [["V", "PETROL", "MANUAL", 1300000], ["ZX CVT", "PETROL", "CVT", 1600000], ["e:HEV ZX", "HYBRID", "CVT", 2050000]] },
      { name: "Amaze", body: "SEDAN", variants: [["VX", "PETROL", "MANUAL", 900000], ["VX CVT", "PETROL", "CVT", 980000]] },
      { name: "Elevate", body: "SUV", variants: [["ZX CVT", "PETROL", "CVT", 1650000]] },
    ],
  },
  {
    name: "Kia",
    popular: true,
    models: [
      { name: "Seltos", body: "SUV", variants: [["HTX", "PETROL", "MANUAL", 1600000], ["GTX Plus Diesel AT", "DIESEL", "AUTOMATIC", 2050000]] },
      { name: "Sonet", body: "SUV", variants: [["HTK Plus", "PETROL", "MANUAL", 1100000], ["GTX Plus DCT", "PETROL", "DCT", 1500000]] },
      { name: "Carens", body: "MUV", variants: [["Luxury Plus Diesel", "DIESEL", "MANUAL", 1900000]] },
    ],
  },
  {
    name: "MG",
    models: [
      { name: "Hector", body: "SUV", variants: [["Sharp Pro CVT", "PETROL", "CVT", 2150000]] },
      { name: "Astor", body: "SUV", variants: [["Sharp", "PETROL", "MANUAL", 1450000]] },
      { name: "ZS EV", body: "SUV", variants: [["Exclusive Pro", "ELECTRIC", "AUTOMATIC", 2500000]] },
      { name: "Comet EV", body: "HATCHBACK", variants: [["Plush", "ELECTRIC", "AUTOMATIC", 900000]] },
    ],
  },
  {
    name: "Volkswagen",
    models: [
      { name: "Virtus", body: "SEDAN", variants: [["Topline TSI AT", "PETROL", "AUTOMATIC", 1700000], ["GT Plus DSG", "PETROL", "DCT", 1950000]] },
      { name: "Taigun", body: "SUV", variants: [["Topline", "PETROL", "MANUAL", 1650000]] },
    ],
  },
  {
    name: "Skoda",
    models: [
      { name: "Slavia", body: "SEDAN", variants: [["Style 1.5 DSG", "PETROL", "DCT", 1950000]] },
      { name: "Kushaq", body: "SUV", variants: [["Style 1.0 AT", "PETROL", "AUTOMATIC", 1800000]] },
    ],
  },
  { name: "Renault", models: [{ name: "Kwid", body: "HATCHBACK", variants: [["RXT", "PETROL", "MANUAL", 560000]] }, { name: "Kiger", body: "SUV", variants: [["RXZ Turbo CVT", "PETROL", "CVT", 1100000]] }] },
  { name: "Nissan", models: [{ name: "Magnite", body: "SUV", variants: [["XV Premium Turbo", "PETROL", "MANUAL", 1050000]] }] },
  {
    name: "BMW",
    luxury: true,
    models: [
      { name: "3 Series", body: "SEDAN", variants: [["330Li M Sport", "PETROL", "AUTOMATIC", 6200000]] },
      { name: "X1", body: "SUV", variants: [["sDrive18d M Sport", "DIESEL", "AUTOMATIC", 5200000]] },
      { name: "X5", body: "SUV", variants: [["xDrive30d M Sport", "DIESEL", "AUTOMATIC", 10500000]] },
      { name: "Z4", body: "CONVERTIBLE", variants: [["M40i", "PETROL", "AUTOMATIC", 9000000]] },
    ],
  },
  {
    name: "Mercedes-Benz",
    luxury: true,
    models: [
      { name: "C-Class", body: "SEDAN", variants: [["C 220d", "DIESEL", "AUTOMATIC", 6200000]] },
      { name: "E-Class", body: "SEDAN", variants: [["E 220d LWB", "DIESEL", "AUTOMATIC", 8000000]] },
      { name: "GLC", body: "SUV", variants: [["300 4MATIC", "PETROL", "AUTOMATIC", 7600000]] },
      { name: "CLE Cabriolet", body: "CONVERTIBLE", variants: [["300 4MATIC", "PETROL", "AUTOMATIC", 11000000]] },
    ],
  },
  {
    name: "Audi",
    luxury: true,
    models: [
      { name: "A4", body: "SEDAN", variants: [["Technology 40 TFSI", "PETROL", "AUTOMATIC", 5000000]] },
      { name: "Q3", body: "SUV", variants: [["Technology", "PETROL", "AUTOMATIC", 5400000]] },
      { name: "Q5", body: "SUV", variants: [["Technology 45 TFSI", "PETROL", "AUTOMATIC", 7200000]] },
      { name: "A5", body: "COUPE", variants: [["Sportback 45 TFSI", "PETROL", "AUTOMATIC", 7500000]] },
    ],
  },
];

export const DEALER_NAMES: [name: string, district: string, city: string][] = [
  ["Malabar Motors", "Ernakulam", "Kochi"],
  ["Pooram Auto Hub", "Thrissur", "Thrissur"],
  ["Capital Car Bazaar", "Thiruvananthapuram", "Thiruvananthapuram"],
  ["Backwater Wheels", "Alappuzha", "Alappuzha"],
  ["Rubber City Cars", "Kottayam", "Kottayam"],
  ["Calicut Pre-Owned", "Kozhikode", "Kozhikode"],
  ["Venad Auto World", "Kollam", "Kollam"],
  ["Nila Car Point", "Palakkad", "Palakkad"],
  ["Eranad Motor Mart", "Malappuram", "Manjeri"],
  ["Kannur Car Mall", "Kannur", "Kannur"],
  ["High Range Vehicles", "Idukki", "Thodupuzha"],
  ["Periyar Auto Traders", "Ernakulam", "Aluva"],
  ["Wayanad Drive", "Wayanad", "Kalpetta"],
  ["Sabari Car Junction", "Pathanamthitta", "Thiruvalla"],
  ["Chandragiri Motors", "Kasaragod", "Kasaragod"],
  ["Lakeshore Luxury Cars", "Ernakulam", "Kakkanad"],
  ["Garden City Autos", "Bengaluru Urban", "Bengaluru"],
  ["Marina Car Exchange", "Chennai", "Chennai"],
  ["Kovai Wheels", "Coimbatore", "Coimbatore"],
  ["Deccan Drive Hub", "Hyderabad", "Hyderabad"],
  ["Konkan Car Co.", "Pune", "Pune"],
  ["Mangala Motors", "Dakshina Kannada", "Mangaluru"],
];

export const FIRST_NAMES = ["Arun", "Biju", "Shaji", "Ramesh", "Anil", "Sajan", "Joseph", "Mohammed", "Faisal", "Rajeev", "Sreejith", "Vinod", "Thomas", "Abdul", "Suresh", "Priya", "Lakshmi", "Anitha", "Deepak", "Harish", "Karthik", "Naveen"];
export const LAST_NAMES = ["Nair", "Menon", "Kurian", "Varghese", "Pillai", "Rahman", "Thomas", "Mathew", "Kumar", "Iyer", "Raj", "Krishnan", "George", "Haneef", "Das"];

export const TESTIMONIALS = [
  { name: "Shaji Varghese", dealership: "Backwater Wheels", city: "Alappuzha", quote: "We turned over 14 trade-ins in our first month. The anti-sniping timer makes the last few minutes fair for everyone — buyers trust it.", rating: 5 },
  { name: "Faisal Rahman", dealership: "Eranad Motor Mart", city: "Manjeri", quote: "Fee breakdown is shown before every bid confirmation, so there are no arguments at delivery. Settlement reached our account the day after handover.", rating: 5 },
  { name: "Priya Menon", dealership: "Lakeshore Luxury Cars", city: "Kakkanad", quote: "Inspection badges changed the game for our premium stock — serious buyers from Bengaluru and Chennai now bid on our cars without visiting.", rating: 5 },
  { name: "Karthik Iyer", dealership: "Kovai Wheels", city: "Coimbatore", quote: "Proxy bidding means my team doesn't have to watch every auction. We set our max and get on with the day.", rating: 4 },
];

export const FAQS = [
  { q: "Who can buy and sell on AutoBidX?", a: "AutoBidX is a dealer-to-dealer marketplace. Any registered used-car dealership in India can join. Bidding and buying are enabled once your KYC (PAN, GST, business registration and bank details) is verified — usually within one business day.", c: "GENERAL" },
  { q: "How does bidding work?", a: "Each auction has a starting bid and a fixed bid increment. Your bid must be at least the current bid plus the increment. All bids are validated on our servers — the countdown you see is synced to server time.", c: "BIDDING" },
  { q: "What is proxy (auto) bidding?", a: "Set the maximum you're willing to pay and AutoBidX bids on your behalf only as much as needed to keep you in the lead. Your maximum is never shown to anyone, including the seller.", c: "BIDDING" },
  { q: "Why did the auction end time change?", a: "To prevent last-second sniping, a bid placed in the final minutes extends the auction (2 minutes by default). This gives every bidder a fair chance to respond.", c: "BIDDING" },
  { q: "What happens if the reserve price isn't met?", a: "The auction ends as 'Reserve not met'. The seller may still accept the highest bid within 24 hours or relist the vehicle.", c: "BIDDING" },
  { q: "What fees does AutoBidX charge?", a: "Buyers pay a small platform fee and a processing fee (plus GST). Sellers pay a transaction fee on successful sales and, depending on plan, a listing fee. The exact breakdown is shown before you confirm any purchase.", c: "FEES" },
  { q: "How are payments protected?", a: "Payments are made to AutoBidX via UPI, net banking, card or bank transfer, and are confirmed only after verification with the payment provider. Seller payouts are released after the buyer confirms delivery.", c: "PAYMENTS" },
  { q: "What if the car doesn't match the listing?", a: "Raise a dispute from the order page before confirming delivery. Our team investigates with both parties and can hold payouts, arrange refunds or apply penalties as per the Dispute Policy.", c: "PAYMENTS" },
];

export const LEGAL_BODY: Record<string, string> = {
  terms: `## Introduction
These Terms govern your use of the AutoBidX marketplace. By creating an account you agree to them.

## Accounts
- You must provide accurate business and KYC information.
- You are responsible for activity under your account and your team members' accounts.

## Marketplace role
AutoBidX provides a platform for dealers to list, bid on and buy vehicles. AutoBidX is not the seller of any vehicle.

## Fees
Fees are published in the Fee Policy and shown before every transaction.

## Disputes
Disputes are handled as described in the Refund Policy and Auction Rules.

*This is template content for a demo environment and must be reviewed by legal counsel before production use.*`,
  privacy: `## What we collect
Account details, business KYC documents, transaction history and technical logs needed to operate a secure marketplace.

## How we use it
- To verify dealers and prevent fraud
- To process transactions and payments
- To send service notifications

## Your choices
You can request a copy or correction of your data by contacting support.

*Template content — review with counsel before production use.*`,
  "dealer-agreement": `## Listing standards
Listings must accurately describe the vehicle, including accident and flood history.

## Obligations on sale
Sellers must hand over documents and the vehicle within the agreed timeline after payment is received.

*Template content — review with counsel before production use.*`,
  "buyer-agreement": `## Bidding
Every bid is a binding commitment to purchase if you win.

## Payment
Winning buyers must complete payment within the payment window shown on the order.

*Template content — review with counsel before production use.*`,
  "refund-policy": `## When refunds apply
Refunds may be issued when a dispute is resolved in the buyer's favour or a sale is cancelled before handover.

## Timelines
Approved refunds are initiated to the original payment method; bank processing times apply.

*Template content — review with counsel before production use.*`,
  "auction-rules": `## Bids
- Minimum next bid = current bid + bid increment.
- Bids are validated by AutoBidX servers; the server clock is authoritative.

## Anti-sniping
A bid placed in the final trigger window extends the auction by the configured extension.

## Reserve
If the reserve is not met the seller may accept the highest bid or relist.

*Template content — review with counsel before production use.*`,
  "fee-policy": `## Buyer fees
A platform fee (percentage of vehicle price) and a fixed processing fee, plus GST.

## Seller fees
A transaction fee on successful sales and an optional listing fee, depending on subscription plan.

Current rates are always shown in the fee breakdown before you confirm a transaction.

*Template content — review with counsel before production use.*`,
  "cookie-policy": `## Cookies we use
- **Essential:** keeps you signed in securely.
- **Preferences:** remembers filters you choose.

We do not use third-party advertising cookies.

*Template content — review with counsel before production use.*`,
};

export const HELP_ARTICLES = [
  { slug: "help-getting-verified", title: "Getting your dealership verified", body: "## Documents you'll need\n- PAN card of the business\n- GST certificate\n- Shop & establishment / registration certificate\n- Address proof\n- Cancelled cheque\n\n## How long it takes\nMost dealerships are verified within one business day." },
  { slug: "help-listing-a-car", title: "Listing a car that sells", body: "## Photos\nUpload at least 8 photos in daylight: front, rear, both sides, interior, dashboard with odometer, engine bay and tyres.\n\n## Pricing\nSet a realistic reserve. Auctions with visible reserves get more early bids." },
  { slug: "help-payments-and-payouts", title: "Payments and payouts", body: "## For buyers\nPay via UPI, net banking, card or bank transfer within the payment window.\n\n## For sellers\nYour net receivable is released after the buyer confirms delivery." },
];
