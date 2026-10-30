export const rules = Object.freeze([
  {
    id: 'JSA-D01',
    title: 'Expected domain outcomes are explicit',
    observation: 'A throw statement occurs in a declared domain file.'
  },
  {
    id: 'JSA-I01',
    title: 'Domain bindings use const',
    observation:
      'A let or var declaration occurs in a declared domain file. const is not proof of deep immutability.'
  },
  {
    id: 'JSA-I02',
    title: 'Observed domain writes remain visible',
    observation:
      'A property/index assignment (including nested destructuring and for-of/in targets), update expression, delete, or recognized mutator call occurs in a declared domain file. Aliases and custom mutators are outside scope.'
  },
  {
    id: 'JSA-E01',
    title: 'Named effects live in adapters',
    observation:
      'A known infrastructure import, console/process/global effect, Date construction, Math.random, or recognized direct timer/fetch call, including parenthesized and string-literal computed/globalThis spellings occurs in a declared domain file. Shadowing can produce a conservative finding.'
  },
  {
    id: 'JSA-E02',
    title: 'Domain does not import declared adapters',
    observation: 'A static domain import resolves to a declared boundary file.'
  },
  {
    id: 'JSA-E03',
    title: 'Dynamic loading is outside the domain profile',
    observation:
      'A dynamic import or require call occurs in a declared domain file; dependency closure cannot be established.'
  }
]);
