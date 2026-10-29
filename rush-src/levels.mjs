// Hand-made levels: a cut-away diner, chef bottom left. x runs right, y is up, the throw plane is z = 0.
// w, h: building size (storeys are 1.2 tall). floors: [x0, x1, top y] balconies.
// items: [model, x, base y, {turn, z}]; dynamic items settle before play.
// hint: throws [vx, vy] that win, found by tools/solve.mjs.
const stack = (key, x, y, n, step) => Array.from({ length: n }, (_, i) => [key, x, y + i * step + .002]);

export const LEVELS = [
  {
    name: 'Table for one', w: 3.4, h: 2.4, chef: [.2, 0],
    ammo: ['burger', 'burger', 'burger'],
    items: [['table', 2.2, 0], ['mug', 2.05, .4], ['plate', 2.3, .4]],
    customers: [{ who: 'cop', x: 2.8, want: 'burger' }],
    hint: [[1.4, 7.8]],
  },
  {
    name: 'Top shelf', w: 3.4, h: 2.4, chef: [.2, 0],
    ammo: ['apple', 'apple', 'apple'],
    floors: [[1.4, 2.5, 1.2]],
    items: [['watermelon', 2.3, 1.2], ...stack('plate', 1.65, 1.2, 4, .041)],
    customers: [{ who: 'beard', x: 2.95, want: 'watermelon' }],
    hint: [[1, 9.8]],
  },
  {
    name: 'Rush hour', w: 3.4, h: 3.6, chef: [.2, 0],
    ammo: ['donut', 'pizza', 'fries', 'fries'],
    floors: [[2, 3.4, 1.2], [1.3, 2.35, 2.4]],
    items: [
      ['table', 1.2, 0], ...stack('plate', 1.2, .4, 7, .041),
      ...stack('plate', 2.25, 1.2, 3, .041), ['mug', 2.15, 2.4],
    ],
    customers: [
      { who: 'cop', x: 1.85, want: 'donut' },
      { who: 'bun', x: 3.05, y: 1.2, want: 'pizza' },
      { who: 'suit', x: 1.85, y: 2.4, want: 'fries' },
    ],
    hint: [[1, 5.4], [1.4, 9.4], [1, 7.8]],
  },
];
