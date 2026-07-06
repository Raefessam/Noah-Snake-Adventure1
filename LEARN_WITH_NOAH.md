# 🐍 Learn to Code with Noah Snake Adventure!

Hi Noah! 👋

You know how you played the snake game and made him eat all those apples and
bananas? Well... your snake is actually made of **words**! Real words, typed
by a computer, that tell the computer exactly what to do. This whole guide
will teach you those words, using YOUR game as the example. Ready? Let's go! 🚀

---

## 🧱 What is HTML?

HTML is like the **skeleton** of a website or game. It says what things
*exist* — like "here's a button," "here's a title," "here's a picture" — but
it doesn't say what color they are or how they move.

In our game, this line of HTML says "make a button called Play":

```html
<button id="btn-play">▶️ Play</button>
```

Think of HTML like building a gingerbread house out of graham crackers
first — just the plain shape, before any icing or candy.

---

## 🎨 What is CSS?

CSS is the **icing and candy**! It makes things pretty. It says what color
things are, how big they are, whether they wiggle or glow, and where they
sit on the screen.

This CSS makes our Play button green and round with a shadow under it:

```css
.btn-primary {
  background: linear-gradient(180deg, #6FE08A, #3EA55D);
  border-radius: 18px;
  box-shadow: 0 6px 0 rgba(0,0,0,0.15);
}
```

Without CSS, every game would look like plain black text on a white page.
Boring! CSS is why your snake game looks like a happy sunny garden instead. 🌻

---

## ⚙️ What is JavaScript?

JavaScript is the **brain**. It's what makes things actually *happen* — like
moving the snake, counting your score, and knowing when you ate an apple.
HTML is the body, CSS is the clothes, and JavaScript is the muscles and
brain that make the body move and think!

---

## 📦 Variables — boxes that hold information

A variable is like a labeled box where the computer keeps something it needs
to remember. In our game:

```js
let score = 0;
```

This makes a box named `score` and puts the number `0` in it. Every time you
eat a fruit, the game does:

```js
score = score + 1;
```

That means: "open the score box, take out the number, add 1, put it back in
the box." That's how the game remembers how many fruits you've eaten!

---

## 🔁 Loops — doing something over and over

A loop tells the computer "keep doing this until I say stop," instead of
writing the same instruction a hundred times.

Our game's grass background uses a loop to draw all 18×18 garden tiles:

```js
for (let y = 0; y < 18; y++) {
  for (let x = 0; x < 18; x++) {
    // draw one tile at position x, y
  }
}
```

That's like saying "for every row, and for every square in that row, draw a
tile" — way faster than typing "draw a tile" 324 times!

---

## ❓ Conditions — the computer making decisions

A condition is the computer asking "is this true?" and doing different
things depending on the answer. It's just like when you decide "IF it's
raining, THEN I'll wear my raincoat."

Our snake uses a condition to check if it hit a wall:

```js
if (newHead.x < 0 || newHead.x >= 18) {
  // uh oh, snake hit the wall — game over!
}
```

This says: "IF the snake's head goes past the edge of the garden, THEN end
the game." Conditions are how the game knows right from wrong, safe from
dangerous!

---

## 🛠️ Functions — reusable recipes

A function is like a recipe card you can use again and again. Instead of
writing "how to make the snake eat food" every single time, we write it
**once** and just call its name whenever we need it.

```js
function eatFood() {
  score = score + 1;
  playEatSound();
  makeSparkles();
}
```

Now, whenever the snake touches food, the game just says `eatFood()` — one
tiny word that runs the whole recipe. Neat, right?

---

## 🧺 Arrays — a list of things in order

An array is a list, like a row of lockers, each one holding something, each
one with a number so you know its place in line.

Your snake's whole body is an array! Each locker holds one segment:

```js
snake = [
  { x: 9, y: 9 },   // the head (locker 0)
  { x: 8, y: 9 },   // the next piece (locker 1)
  { x: 7, y: 9 }    // the tail (locker 2)
];
```

When the snake grows, we just add a new locker to the front of the list!

---

## 🎒 Objects — a backpack of related facts

An object groups related information together under one name, like a
backpack holding everything about one thing.

Each fruit in the game is an object — one backpack holding its picture and
its color:

```js
let apple = { emoji: '🍎', color: '#FF6F61' };
```

Now, instead of remembering the apple's emoji and color separately, we just
carry around one backpack called `apple`.

---

## 🖱️ Events — the computer noticing what YOU do

An event is the computer noticing something happened — like you pressing a
key, tapping the screen, or clicking a button — and reacting to it.

```js
window.addEventListener('keydown', (key) => {
  if (key === 'ArrowUp') {
    // turn the snake upward!
  }
});
```

This says: "Hey computer, keep watching for any key press. The moment one
happens, check what it was, and react." That's how your snake instantly
turns the second you press an arrow key!

---

## 🎬 Animation — pictures that trick your eyes

Animation is just showing lots of *slightly different* pictures, really
fast, one after another — so fast your eyes think it's smooth movement! It's
the same trick flip-books use.

Our game redraws the whole screen up to 60 times every single second. Each
tiny redraw moves the snake juuust a little bit further than the last one,
so it looks like it's gliding smoothly through the garden.

---

## 💥 Collision Detection — did two things touch?

Collision detection is the computer checking "are these two things in the
same spot?" It's like checking if two puzzle pieces are sitting in the exact
same square.

```js
if (snakeHead.x === food.x && snakeHead.y === food.y) {
  // they're on the same square — yum, eaten!
}
```

This is how the game knows the difference between the snake just passing
near a strawberry versus actually eating it!

---

## 🔄 The Game Loop — the heartbeat of every game

Every single game that has ever existed — from Snake to the biggest video
games in the world — has one thing in common: a **game loop**. It's a
never-ending cycle that repeats, over and over, super fast:

1. **Look** — check what buttons/keys are being pressed right now.
2. **Think** — update everything: move the snake, check collisions, add
   score.
3. **Draw** — repaint the whole screen so you can see the new positions.
4. Go back to step 1. Forever, until the game ends.

That loop is the heartbeat of Noah Snake Adventure — and every game you'll
ever build!

---

## 💛 A note from Dad

One day, Noah, you will build games even better than this one.

Love,
Dad ❤️
