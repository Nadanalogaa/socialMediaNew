/**
 * Starting points for Magic Design, by industry.
 *
 * Each template is a description a business might have typed, so the AI
 * writes a fresh story from it, plus a ready-made brief that works with no
 * model at all. Placeholders in braces are filled from the brand kit.
 */

export interface MagicTemplate {
  slug: string;
  industry: string;
  emoji: string;
  name: string;
  /** What the reel is for, in a few words. */
  goal: string;
  /** The description the AI writes the story from. */
  description: string;
  /** Scenes ready to build without the AI. */
  brief: string;
}

export const MAGIC_INDUSTRIES = [
  'Education & classes',
  'Food & cafés',
  'Salon & beauty',
  'Health & clinics',
  'Fitness & yoga',
  'Retail & boutiques',
  'Jewellery',
  'Real estate',
  'Travel & events',
  'Home services',
  'Coaching & tuition',
  'Culture & temples',
] as const;

export const MAGIC_TEMPLATES: MagicTemplate[] = [
  {
    slug: 'edu-admissions',
    industry: 'Education & classes',
    emoji: '🎓',
    name: 'Admissions open',
    goal: 'Fill the new batch',
    description:
      '{name} is a fine arts academy in {city}. We teach Bharatanatyam, Carnatic vocal and keyboard for children from age 5 and adults, with experienced teachers. Admissions for the new batch are open, weekend classes available, and there is a free demo class.',
    brief: `Scene 1 - Opening
Discover Your Talent [bold, big]
Dance • Music • Art
And add a photo

Scene 2 - What we teach
Bharatanatyam · Carnatic · Keyboard [caps]
For children from 5 and adults
Weekend batches available

Scene 3 - Join us
Admissions Open [huge, yellow, pop]
Free demo class — book today
Contact: {phone}
Website: {website}`,
  },
  {
    slug: 'edu-annual-day',
    industry: 'Education & classes',
    emoji: '🎭',
    name: 'Annual day invite',
    goal: 'Invite families to an event',
    description:
      '{name} invites everyone to its annual day, a stage show by our students: dance, music and drama. It is on the date in the caption at our auditorium in {city}; entry is free for families. We want parents and friends to come and cheer.',
    brief: `Scene 1 - Opening
You Are Invited [bold, big, gold]
Annual Day · Stage Show
And add a photo

Scene 2 - The show
Dance · Music · Drama [caps]
Performed by our students
Entry free for families

Scene 3 - Come along
Save the Date [huge, pop]
{name}
Contact: {phone}`,
  },
  {
    slug: 'food-weekend-offer',
    industry: 'Food & cafés',
    emoji: '🍛',
    name: 'Weekend offer',
    goal: 'Bring in weekend footfall',
    description:
      '{name} is a family restaurant in {city} known for South Indian meals and biryani. This weekend there is a special offer on the family combo, dine-in and takeaway. Fresh, homely food, quick service, parking available.',
    brief: `Scene 1 - Opening
Weekend Special [bold, huge, yellow]
At {name}
And add a photo

Scene 2 - The offer
Family Combo Offer [caps, pop]
Dine-in and takeaway
This Saturday and Sunday

Scene 3 - Visit
Come Hungry [big]
Fresh · Homely · Quick
Contact: {phone}`,
  },
  {
    slug: 'food-new-menu',
    industry: 'Food & cafés',
    emoji: '☕',
    name: 'New menu launch',
    goal: 'Announce new dishes',
    description:
      '{name} is a café in {city}. We have launched a new menu: cold coffees, sandwiches, pasta and desserts, all made fresh in-house. Cosy seating, good Wi-Fi, open till late. Come and try it this week.',
    brief: `Scene 1 - Opening
New Menu Is Here [bold, big]
{name}
And add a photo

Scene 2 - On the menu
Cold Coffees · Sandwiches · Pasta · Desserts
Made fresh in-house
Open till late

Scene 3 - Try it
Come Try It This Week [huge, pop]
Contact: {phone}
Website: {website}`,
  },
  {
    slug: 'salon-festive',
    industry: 'Salon & beauty',
    emoji: '💇',
    name: 'Festive package',
    goal: 'Book festive appointments',
    description:
      '{name} is a unisex salon in {city}. For the festive season we have a package: haircut, facial and hair spa at a special price, for men and women. Trained stylists, hygienic tools, appointments by phone or WhatsApp.',
    brief: `Scene 1 - Opening
Festive Glow [bold, huge, pink]
{name}
And add a photo

Scene 2 - The package
Haircut + Facial + Hair Spa [caps]
Special festive price
For men and women

Scene 3 - Book
Book Your Slot [big, pop]
WhatsApp or call
Contact: {phone}`,
  },
  {
    slug: 'salon-bridal',
    industry: 'Salon & beauty',
    emoji: '👰',
    name: 'Bridal bookings',
    goal: 'Get wedding-season bookings',
    description:
      '{name} does bridal makeup and hairstyling in {city}, at the salon or at your venue. Wedding season bookings are open; a trial session is available. HD and airbrush makeup, saree draping, mehendi partners.',
    brief: `Scene 1 - Opening
Your Big Day, Perfected [bold, big, gold]
{name}
And add a photo

Scene 2 - Services
HD & Airbrush Makeup
Hairstyling · Saree draping
At the salon or your venue

Scene 3 - Book early
Wedding Season Bookings Open [huge, pop]
Trial session available
Contact: {phone}`,
  },
  {
    slug: 'clinic-camp',
    industry: 'Health & clinics',
    emoji: '🩺',
    name: 'Health check-up camp',
    goal: 'Register people for a camp',
    description:
      '{name} is a clinic in {city}. We are holding a free health check-up camp this weekend: blood pressure, sugar and BMI checks, with a doctor consultation. Registration by phone; limited slots. Families welcome.',
    brief: `Scene 1 - Opening
Free Health Check-up Camp [bold, big, green]
{name}
And add a photo

Scene 2 - What is checked
Blood pressure · Sugar · BMI
Doctor consultation included
This weekend, limited slots

Scene 3 - Register
Register Now [huge, pop]
Contact: {phone}
Website: {website}`,
  },
  {
    slug: 'dental-smile',
    industry: 'Health & clinics',
    emoji: '🦷',
    name: 'Dental offer',
    goal: 'Bring in new patients',
    description:
      '{name} is a dental clinic in {city}. This month a consultation and scaling are offered at a special price. Painless treatment, modern equipment, evening appointments available. Book by phone or WhatsApp.',
    brief: `Scene 1 - Opening
Smile With Confidence [bold, big]
{name}
And add a photo

Scene 2 - The offer
Consultation + Scaling [caps]
Special price this month
Painless · Modern · Evening slots

Scene 3 - Book
Book Your Visit [huge, pop]
Contact: {phone}`,
  },
  {
    slug: 'fitness-batch',
    industry: 'Fitness & yoga',
    emoji: '🧘',
    name: 'New batch starting',
    goal: 'Enrol a new morning batch',
    description:
      '{name} runs yoga and fitness classes in {city}. A new morning batch starts next week for beginners: yoga, stretching and breathing, small groups, certified trainer. First class is free. Timings in the morning before work.',
    brief: `Scene 1 - Opening
Start Your Mornings Right [bold, big]
{name}
And add a photo

Scene 2 - The batch
New Beginners Batch [caps, green]
Yoga · Stretching · Breathing
Small groups, certified trainer

Scene 3 - Join
First Class Free [huge, pop]
Starts next week
Contact: {phone}`,
  },
  {
    slug: 'gym-transformation',
    industry: 'Fitness & yoga',
    emoji: '🏋️',
    name: 'Gym membership offer',
    goal: 'Sell memberships',
    description:
      '{name} is a gym in {city} with modern equipment, personal trainers and group classes. There is a membership offer this month with no joining fee. Open from early morning to late night, separate ladies timing.',
    brief: `Scene 1 - Opening
Stronger Every Day [bold, huge]
{name}
And add a photo

Scene 2 - Inside
Modern equipment · Personal trainers
Group classes
Early morning to late night

Scene 3 - Offer
No Joining Fee This Month [big, yellow, pop]
Contact: {phone}`,
  },
  {
    slug: 'retail-festival-sale',
    industry: 'Retail & boutiques',
    emoji: '🛍️',
    name: 'Festival sale',
    goal: 'Drive a seasonal sale',
    description:
      '{name} is a clothing boutique in {city}. Our festival sale is on: new sarees, kurtis and kidswear with discounts across the store. Latest collection, all sizes, easy exchange. Visit the store or order on WhatsApp.',
    brief: `Scene 1 - Opening
Festival Sale Is On [bold, huge, yellow]
{name}
And add a photo

Scene 2 - Collection
Sarees · Kurtis · Kidswear [caps]
New arrivals, all sizes
Discounts across the store

Scene 3 - Visit
Visit Us or Order on WhatsApp [big, pop]
Contact: {phone}
Website: {website}`,
  },
  {
    slug: 'retail-new-arrivals',
    industry: 'Retail & boutiques',
    emoji: '✨',
    name: 'New arrivals',
    goal: 'Show a fresh collection',
    description:
      '{name} in {city} has new arrivals this week: the latest designs, limited pieces, prices for every budget. Come early for the best picks. Gift wrapping available.',
    brief: `Scene 1 - Opening
New Arrivals [bold, huge]
{name}
And add a photo

Scene 2 - Collection
Latest Designs · Limited Pieces
Prices for every budget
Gift wrapping available

Scene 3 - Visit
Come Early for the Best Picks [big, pop]
Contact: {phone}`,
  },
  {
    slug: 'jewellery-wedding',
    industry: 'Jewellery',
    emoji: '💍',
    name: 'Wedding collection',
    goal: 'Showcase bridal jewellery',
    description:
      '{name} is a jewellery showroom in {city}. Our wedding collection is in: gold, diamond and temple jewellery, with certified purity and lifetime exchange. Making charge offer for the season. Visit the showroom.',
    brief: `Scene 1 - Opening
The Wedding Collection [bold, big, gold]
{name}
And add a photo

Scene 2 - Collection
Gold · Diamond · Temple Jewellery [caps]
Certified purity
Lifetime exchange

Scene 3 - Offer
Making Charge Offer This Season [huge, pop]
Visit the showroom
Contact: {phone}`,
  },
  {
    slug: 'realestate-launch',
    industry: 'Real estate',
    emoji: '🏠',
    name: 'New project launch',
    goal: 'Get site-visit enquiries',
    description:
      '{name} is launching new apartments in {city}: 2 and 3 BHK, near schools and the metro, with approved plans and bank loans available. Site visits every day; book a visit by phone.',
    brief: `Scene 1 - Opening
Your New Home Awaits [bold, big]
{name}
And add a photo

Scene 2 - The project
2 & 3 BHK Apartments [caps]
Near schools and the metro
Approved plans · Bank loans available

Scene 3 - Visit
Book a Site Visit [huge, pop]
Contact: {phone}
Website: {website}`,
  },
  {
    slug: 'travel-package',
    industry: 'Travel & events',
    emoji: '✈️',
    name: 'Tour package',
    goal: 'Sell a holiday package',
    description:
      '{name} is a travel agency in {city}. We have a holiday package this season with hotel, travel and sightseeing included, for families and groups. Easy EMI, experienced guides. Limited seats; book early.',
    brief: `Scene 1 - Opening
Plan Your Holiday [bold, huge, blue]
{name}
And add a photo

Scene 2 - Package
Hotel + Travel + Sightseeing [caps]
For families and groups
Easy EMI · Experienced guides

Scene 3 - Book
Limited Seats — Book Early [big, pop]
Contact: {phone}`,
  },
  {
    slug: 'events-photography',
    industry: 'Travel & events',
    emoji: '📸',
    name: 'Wedding photography',
    goal: 'Get wedding bookings',
    description:
      '{name} is a wedding photography and video team in {city}: candid photos, cinematic films, drone shots and same-day edits. Bookings open for the wedding season; packages for every budget.',
    brief: `Scene 1 - Opening
Moments That Last Forever [bold, big]
{name}
And add a photo

Scene 2 - What we do
Candid Photos · Cinematic Films
Drone shots · Same-day edits
Packages for every budget

Scene 3 - Book
Wedding Season Bookings Open [huge, pop]
Contact: {phone}
Website: {website}`,
  },
  {
    slug: 'home-services',
    industry: 'Home services',
    emoji: '🔧',
    name: 'Service offer',
    goal: 'Get service calls',
    description:
      '{name} provides AC service, plumbing and electrical repairs in {city}. Same-day visits, trained technicians, transparent pricing, 30-day service warranty. Summer AC service offer on now; book by phone or WhatsApp.',
    brief: `Scene 1 - Opening
Fixed Today, Done Right [bold, big]
{name}
And add a photo

Scene 2 - Services
AC Service · Plumbing · Electrical [caps]
Same-day visits · Trained technicians
30-day service warranty

Scene 3 - Book
Summer AC Service Offer [huge, yellow, pop]
Contact: {phone}`,
  },
  {
    slug: 'coaching-results',
    industry: 'Coaching & tuition',
    emoji: '📚',
    name: 'Exam batch',
    goal: 'Enrol students for an exam batch',
    description:
      '{name} is a coaching centre in {city} for school and competitive exams. The new batch starts soon: small groups, weekly tests, doubt-clearing sessions and study material included. Our students have scored well; a free counselling session is available for parents.',
    brief: `Scene 1 - Opening
Score Higher This Year [bold, big]
{name}
And add a photo

Scene 2 - How we teach
Small Groups · Weekly Tests
Doubt-clearing sessions
Study material included

Scene 3 - Join
New Batch Starting Soon [huge, pop]
Free counselling for parents
Contact: {phone}`,
  },
  {
    slug: 'culture-event',
    industry: 'Culture & temples',
    emoji: '🪔',
    name: 'Festival event',
    goal: 'Invite the community',
    description:
      '{name} in {city} is celebrating the festival with a special programme: pooja, music and a community feast, open to all. Volunteers and sponsors are welcome. Everyone is invited with family.',
    brief: `Scene 1 - Opening
Everyone Is Invited [bold, big, gold]
{name}
And add a photo

Scene 2 - Programme
Pooja · Music · Community Feast
Open to all
Volunteers and sponsors welcome

Scene 3 - Come
Celebrate With Us [huge, pop]
Bring your family
Contact: {phone}`,
  },
];

export function findMagicTemplate(slug: string): MagicTemplate | undefined {
  return MAGIC_TEMPLATES.find((template) => template.slug === slug);
}
