export type MarketingPlan = {
  name: string;
  price: string;
  cadence: string;
  properties: string;
  summary: string;
  details: string[];
  featured?: boolean;
  badge?: string;
  cta: string;
};

export type MarketingFeature = {
  title: string;
  body: string;
};

export type MarketingFaq = {
  question: string;
  answer: string;
};

export const marketingHeroStats = [
  { value: "30 days", label: "Free trial for every new company" },
  { value: "$20 CAD", label: "Starter plan for up to 10 properties" },
  { value: "1 platform", label: "Admin, cleaners, grounds, and owners together" },
];

export const marketingPlans: MarketingPlan[] = [
  {
    name: "Starter",
    price: "$20",
    cadence: "CAD / month",
    properties: "Up to 10 properties",
    summary: "For operators who want one clean place to run jobs, staff, owners, and updates.",
    details: [
      "30-day free trial",
      "Admin, cleaner, grounds, and owner portals",
      "Jobs, invoices, chat, bulletin board, and documents",
      "No setup fee and no per-booking fee",
    ],
    featured: true,
    badge: "Best launch value",
    cta: "Start free trial",
  },
  {
    name: "Growth",
    price: "$40",
    cadence: "CAD / month",
    properties: "Up to 25 properties",
    summary: "For growing operations that need more capacity without jumping to enterprise pricing.",
    details: [
      "Everything in Starter",
      "More properties without changing workflows",
      "Ideal for expanding PM and cleaning teams",
    ],
    cta: "Choose Growth",
  },
  {
    name: "Custom",
    price: "Custom",
    cadence: "Pricing",
    properties: "26+ properties",
    summary: "For larger portfolios that want a tailored rollout and pricing structure.",
    details: [
      "Custom property count",
      "Portfolio-specific onboarding path",
      "Direct support for scaling operations",
    ],
    cta: "Talk to us",
  },
];

export const marketingFeatures: MarketingFeature[] = [
  {
    title: "Run the whole operation from one place",
    body: "Keep properties, bookings, job flow, access notes, invoices, and team communication connected instead of scattered across apps and spreadsheets.",
  },
  {
    title: "Built for admin, cleaners, and grounds",
    body: "Each team gets a focused portal, while admins still keep control of assignments, updates, and day-to-day visibility.",
  },
  {
    title: "Owner access without extra confusion",
    body: "Give owners a clean place for invoices and updates without exposing the internal operations side of the business.",
  },
  {
    title: "Shared updates that stay visible",
    body: "Use the Bulletin Board for team-wide notes that should be seen across admin, cleaners, and grounds without turning them into chat threads.",
  },
  {
    title: "Cleaner pricing than larger competitors",
    body: "Launch pricing starts at $20 CAD per month for up to 10 properties, giving smaller operators a realistic entry point.",
  },
  {
    title: "Fast setup path",
    body: "Start with your properties, connect calendars, assign teams, and begin running the operation with a 30-day free trial.",
  },
];

export const marketingFaqs: MarketingFaq[] = [
  {
    question: "Is there a free trial?",
    answer: "Yes. Every new company starts with a 30-day free trial so you can set up properties, teams, and workflows before paying.",
  },
  {
    question: "What is included in the $20 CAD Starter plan?",
    answer: "Starter includes up to 10 properties, admin access, cleaner and grounds workflows, owner access, jobs, invoices, documents, chat, and the Bulletin Board.",
  },
  {
    question: "What happens when I grow past 10 properties?",
    answer: "You can move to Growth at $40 CAD per month for up to 25 properties, or use custom pricing if your portfolio is larger.",
  },
  {
    question: "Do I need separate tools for cleaners and grounds?",
    answer: "No. Estate of Mind keeps those workflows inside the same platform while still giving each group its own focused experience.",
  },
  {
    question: "Is setup included?",
    answer: "Yes. There is no separate setup fee in the launch pricing. You can create the company, add properties, and begin using the system during the trial.",
  },
  {
    question: "Can cleaning companies use it too?",
    answer: "Yes. Cleaning-company admins can run their own workspace, manage staff, receive jobs, and use the shared Bulletin Board.",
  },
];

export const foundingOffer = {
  title: "Founding annual option",
  price: "$200 CAD / year",
  body: "For early customers who want the lowest launch pricing right away. This works out below the monthly Starter rate.",
};
