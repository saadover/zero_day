// Every question the app can ask. For each decision, /api/questions asks Jev
// which of these matter, so a food choice never asks about religion unless
// faith could change the answer.
//
// Fields:
//   title, lead      what the page shows
//   type             "number", "single", "stack" (single, with a line under
//                    each option), "multi" or "text"
//   options          for choice types; "{a}" and "{b}" become the two options
//   remember         a fact about the person (saved on the phone and not asked
//                    again) rather than about this decision
//   relevance        tells Jev when the question is worth asking
//   factor, why      the Jev question comparing the options on this answer,
//                    and the reason shown when it favours the pick

const QUESTIONS = {
  age: {
    title: "How old are you?",
    lead: "What's right at 18 isn't always right at 45.",
    type: "number",
    remember: true,
    relevance: "The person's age or stage of life could change which option suits them.",
    factor: "Which option suits someone aged `person.age` better at this stage of life?",
    why: (v) => "Suits where you are in life at " + v,
  },
  religion: {
    title: "What's your religion?",
    lead: "So the decision respects what you believe.",
    type: "single",
    options: ["Islam", "Christianity", "Judaism", "Hinduism", "Buddhism", "Sikhism", "Spiritual", "Other", "Not religious", "Prefer not to say"],
    remember: true,
    relevance:
      "Only when religious rules or beliefs could clearly affect this choice, such as food and drink, " +
      "alcohol, marriage, interest-bearing loans, clothing, holidays or prayer times. Not for everyday " +
      "choices that no religion has a view on.",
    factor: "Which option fits better with the person's faith, `person.religion`?",
    why: (v) => (/^(not religious|prefer not to say|other)$/i.test(v) ? "Fits better with your values" : "Fits better with your faith (" + v + ")"),
  },
  diet: {
    title: "Do you follow a diet?",
    lead: "Pick any that apply.",
    type: "multi",
    max: 3,
    options: ["No restrictions", "Halal", "Kosher", "Vegetarian", "Vegan", "Gluten-free", "Low-carb", "Dairy-free"],
    remember: true,
    relevance: "The choice involves food or drink.",
    factor: "Which option fits the person's diet, `person.diet`, better?",
    why: (v) => "Fits your diet (" + v.join(", ").toLowerCase() + ")",
  },
  health: {
    title: "Any health goals right now?",
    lead: "Pick any that apply.",
    type: "multi",
    max: 3,
    options: ["Losing weight", "Building muscle", "Eating healthier", "Sleeping better", "Less stress", "Managing a condition", "None in particular"],
    remember: true,
    relevance: "The choice could affect the person's health, fitness, weight, sleep or stress.",
    factor: "Which option is better for the person's health goals, `person.health`?",
    why: (v) => "Better for your health goals (" + v.join(", ").toLowerCase() + ")",
  },
  priorities: {
    title: "What matters most to you here?",
    lead: "Pick up to three.",
    type: "multi",
    max: 3,
    options: ["Family", "Money", "Career", "Health", "Happiness", "Faith", "Freedom", "Security", "Adventure", "Learning", "Friends", "Love"],
    relevance: "The choice is a significant life decision where personal values and priorities decide it.",
    factor: "Which option better serves what matters most to the person, `person.priorities`?",
    why: (v) => "Serves what matters most to you (" + v.join(", ").toLowerCase() + ")",
  },
  budget: {
    title: "How's your money situation?",
    lead: "Be honest. Nobody else sees this.",
    type: "stack",
    options: [
      ["Tight", "Every bit counts right now"],
      ["Okay", "I can handle some costs"],
      ["Comfortable", "Money isn't the main worry"],
    ],
    remember: true,
    relevance: "The options could cost noticeably different amounts of money.",
    factor: "Which option is the better use of money for someone whose budget is `person.budget`?",
    why: (v) => "Easier on your budget (" + v.toLowerCase() + ")",
  },
  risk: {
    title: "Safe or bold?",
    lead: "When life gives you a choice, you usually…",
    type: "stack",
    options: [
      ["Play it safe", "I prefer what I know"],
      ["In between", "A little risk is fine"],
      ["Take chances", "Big risks, big rewards"],
    ],
    remember: true,
    relevance: "One option is clearly riskier or less certain than the other.",
    factor: "Which option better matches the person's appetite for risk, `person.risk`?",
    why: (v) => "Matches how much risk you like to take (" + v.toLowerCase() + ")",
  },
  dependents: {
    title: "Who depends on you?",
    lead: "Pick any that apply.",
    type: "multi",
    max: 4,
    options: ["No one", "Partner", "Kids", "Parents", "Pets"],
    remember: true,
    relevance: "The choice could affect people or pets who depend on the person: moving, jobs, money, time away, big purchases.",
    factor: "Which option is better for those who depend on the person, `person.dependents`?",
    why: (v) => "Better for " + (v.includes("No one") ? "you, with no one else to plan around" : "your " + v.join(", ").toLowerCase()),
  },
  work: {
    title: "What do you do?",
    lead: "Your day-to-day situation.",
    type: "single",
    options: ["Student", "Employed", "Self-employed", "Looking for work", "Stay-at-home", "Retired"],
    remember: true,
    relevance: "The choice touches studies, jobs, careers, schedules or income.",
    factor: "Which option fits better with the person's situation, `person.work`?",
    why: (v) => "Fits your situation (" + v.toLowerCase() + ")",
  },
  place: {
    title: "Where do you live?",
    lead: "Roughly.",
    type: "single",
    options: ["Big city", "Town", "Suburbs", "Countryside"],
    remember: true,
    relevance: "Where the person lives matters: housing, cars, commuting, moving, outdoor activities.",
    factor: "Which option suits someone living in `person.place` better?",
    why: (v) => "Suits life in the " + v.toLowerCase().replace(/^big /, ""),
  },
  social: {
    title: "How do you recharge?",
    lead: "Be honest.",
    type: "stack",
    options: [
      ["Alone", "Quiet time is my reset"],
      ["A bit of both", "Depends on the day"],
      ["With people", "Being around others energizes me"],
    ],
    remember: true,
    relevance: "One option is more social or more solitary than the other.",
    factor: "Which option suits someone who recharges `person.social`?",
    why: (v) => "Suits how you recharge (" + v.toLowerCase() + ")",
  },
  experience: {
    title: "How much do you know about this?",
    lead: "Your experience with what you're choosing between.",
    type: "stack",
    options: [
      ["Beginner", "I'm new to this"],
      ["Some experience", "I know the basics"],
      ["Expert", "I know it well"],
    ],
    relevance: "The options need different levels of skill or knowledge: gear, tech, hobbies, courses, sports.",
    factor: "Which option is a better fit for someone at the `person.experience` level?",
    why: (v) => "Right for your level (" + v.toLowerCase() + ")",
  },
  use: {
    title: "How often would you use it?",
    lead: "Honestly, not ideally.",
    type: "single",
    options: ["Every day", "A few times a week", "Now and then", "Rarely"],
    relevance: "The choice is between things to buy or subscribe to.",
    factor: "Which option is better value for someone who would use it `person.use`?",
    why: (v) => "Makes more sense for how often you'd use it (" + v.toLowerCase() + ")",
  },
  style: {
    title: "What's your style?",
    lead: "Pick the closest.",
    type: "single",
    options: ["Classic", "Minimal", "Modern", "Sporty", "Bold", "Cozy"],
    relevance: "The choice is about looks: clothes, shoes, decor, cars, phones, haircuts, design.",
    factor: "Which option matches the style `person.style` better?",
    why: (v) => "Matches your style (" + v.toLowerCase() + ")",
  },
  mood: {
    title: "What are you in the mood for?",
    lead: "Right now.",
    type: "single",
    options: ["Something comforting", "Something new", "Something light", "Something exciting", "Something relaxing"],
    relevance: "The choice is about food, a drink, entertainment, a trip or how to spend free time right now.",
    factor: "Which option better matches the mood `person.mood`?",
    why: (v) => "Matches your mood (" + v.toLowerCase() + ")",
  },
  energy: {
    title: "How's your energy?",
    lead: "Right now.",
    type: "single",
    options: ["Drained", "Normal", "Full of energy"],
    relevance: "The options need different amounts of energy or effort today: going out, exercise, cooking, events.",
    factor: "Which option suits someone whose energy is `person.energy` right now?",
    why: (v) => "Suits your energy right now (" + v.toLowerCase() + ")",
  },
  company: {
    title: "Who's with you?",
    lead: "For this one.",
    type: "single",
    options: ["Just me", "Partner", "Friends", "Family", "Kids", "Coworkers"],
    relevance: "The choice is an activity, meal, trip or outing that others might share.",
    factor: "Which option works better with the company `person.company`?",
    why: (v) => "Works better with " + (v === "Just me" ? "just you" : "your " + v.toLowerCase()),
  },
  timing: {
    title: "How soon does this happen?",
    lead: "When do you need the choice to play out?",
    type: "single",
    options: ["Today", "This week", "This month", "This year", "No rush"],
    relevance: "Timing or deadlines could favour one option over the other.",
    factor: "Which option works better given the timing `person.timing`?",
    why: (v) => "Works with your timing (" + v.toLowerCase() + ")",
  },
  goal: {
    title: "What would a great outcome look like?",
    lead: "In a sentence or two.",
    type: "text",
    relevance: "The choice is important or complex enough that the person's goal for it would change the answer.",
    factor: "Which option is more likely to give the person the outcome they want, `person.goal`?",
    why: () => "More likely to get you the outcome you described",
  },
  gut: {
    title: "Which way is your gut leaning?",
    lead: "First instinct. Don't overthink it.",
    type: "single",
    options: ["{a}", "{b}", "No idea"],
    relevance: "Almost always worth a quick check, unless the choice is trivial.",
    // Used as context only; no factor, since the pick already weighs it.
  },
};

// Asked for every decision, on top of the ones Jev chooses.
const GENERAL = {
  long_term: { factor: "Which option is likely to leave the person better off later on?", why: () => "Better for you in the long run" },
  happiness: { factor: "Which option is likely to make the person happier?", why: () => "Likely to make you happier" },
  regret: { factor: "Which option would the person be more likely to regret NOT choosing?", why: () => "The one you'd regret passing up" },
};

// What the page needs to show a question: no Jev instructions.
function publicQuestion(id) {
  const q = QUESTIONS[id];
  return { id, title: q.title, lead: q.lead, type: q.type, options: q.options, max: q.max, remember: Boolean(q.remember) };
}

module.exports = { QUESTIONS, GENERAL, publicQuestion };
