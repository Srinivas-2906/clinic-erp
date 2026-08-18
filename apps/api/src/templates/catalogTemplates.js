/** Matches dental-clinic/src/lib/services.ts plus General Consultation first. */
const TEMPLATES = {
  clinic: [
    { title: 'General Consultation', subtitle: 'Examination, diagnosis and treatment advice', price: '₹300', priceNum: 300, meta: '30 min', image: '', category: 'Consultation' },
    { title: 'Cosmetic Dentistry', subtitle: 'Whitening, veneers and smile makeovers', price: 'From ₹3,000', priceNum: 3000, meta: 'Smile makeover', image: '', category: 'Cosmetic' },
    { title: 'Crowns, Bridges & Dentures', subtitle: 'Custom teeth replacements to eat and smile comfortably', price: 'From ₹8,000', priceNum: 8000, meta: 'Consultation required', image: '', category: 'Prosthetics' },
    { title: 'Orthodontic Aligners', subtitle: 'Clear aligners for irregular teeth', price: 'Consultation', priceNum: 0, meta: 'Guided planning', image: '', category: 'Orthodontics' },
    { title: 'Root Canal Treatment (RCT)', subtitle: 'Relieve tooth pain and save the tooth', price: 'From ₹3,500', priceNum: 3500, meta: 'Per tooth', image: '', category: 'Treatment' },
    { title: 'Fillings (Conservative Dentistry)', subtitle: 'Tooth-coloured fillings', price: 'From ₹800', priceNum: 800, meta: 'Per tooth', image: '', category: 'Treatment' },
    { title: 'Scaling & Cleaning', subtitle: 'Professional cleaning for healthy gums', price: 'From ₹800', priceNum: 800, meta: 'Routine care', image: '', category: 'Preventive' },
    { title: 'Implants & Artificial Teeth', subtitle: 'Fixed replacements for missing teeth', price: 'From ₹15,000', priceNum: 15000, meta: 'Per unit', image: '', category: 'Implants' },
    { title: 'Oral Diagnosis & X-rays', subtitle: 'Clear diagnosis and treatment planning', price: 'From ₹300', priceNum: 300, meta: 'As needed', image: '', category: 'Diagnosis' },
    { title: 'Family & Kids Dentistry', subtitle: 'Gentle care for children, adults and seniors', price: '₹300', priceNum: 300, meta: 'All ages', image: '', category: 'Family' },
  ],
};

export function getCatalogTemplate(industry) {
  return TEMPLATES[industry] ?? TEMPLATES.clinic;
}
