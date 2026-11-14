# AA Split Calculator (aa-splitter)

After a dinner, a trip, or shared rent, see who pays whom and how much, in one click, with the fewest transfers possible.

Live demo: https://laomaiai.github.io/aa-splitter/

## What it is

A split-the-bill tool for groups with many people and many expenses. Record each expense: who paid, how much, and who shares it. Then settle with one click and get a transfer list that says who pays whom and how much, using the fewest transfers possible. You can also generate a bill image and share it to the group chat.

It fits dinners, trips, shared flats, and team outings where costs are split.

## How to use

1. Add members: type in each person's name.
2. Record expenses: pick who paid, enter the amount, tick the people who share it, add a short note.
3. Settle: read the transfer plan, copy it as text, or generate a bill image to share.

First time here? Tap "load sample data" to see a full example, then clear it and start your own.

## How the minimum-transfer plan is computed

This is the deterministic computation layer of the product. It is all code. No large language model is used anywhere:

- Money is computed in integer cents. Every amount is converted to integer cents before any math, with no floating point, so not a single cent is lost or invented.
- Each expense is split evenly among its participants. When it does not divide evenly, the leftover cents go to the first participants in the order they were picked. The rule is fixed, so the result is the same every time.
- Each person ends up with one net balance: positive means the group owes them, negative means they owe the group.
- When at most 15 people have a nonzero balance, subset dynamic programming finds the partition into the most zero-sum groups, which proves the transfer count is minimal.
- Beyond 15 people, the app switches to greedy pairing of the largest debtor with the largest creditor. The result is still correct, everyone ends at zero, and the count is at most the number of people minus one. It is just no longer proven minimal.
- Tests check 300 random bills against an independent brute-force implementation: every case settles, money is conserved, and the count equals the brute-force minimum.

## Bill image

Tap "generate bill image" and the app draws a bill image with Canvas on your own device: expense details, the transfer plan, and the total. The image stays in your browser. Tap save to download it, or long-press to save it.

## Data and privacy

- Data lives only in your browser's localStorage. Nothing is uploaded to a server, and there is no sign-up.
- There is no backend, no account, and no third-party analytics. Clearing browser data clears the bills.

## Compliance and limits

- This product does not involve stocks, crypto assets, or money custody. It never touches anyone's money. It only calculates the expenses the user enters.
- Amounts and sharing relationships are entered by the user. The tool only does arithmetic and gives no financial or investment advice.
- Make the actual transfers in WeChat Pay, Alipay, or your bank. This product never initiates or proxies a transfer.

## Run locally

```bash
npm install
npm run dev
```

Open the address shown in the terminal.

## Tests

```bash
npm test
```

Coverage: split rules (remainder distribution, payer outside the participant list, two expenses netting out), minimum transfer counts (the classic counterexample, 300 random cases checked against brute force, the 15-person boundary, the 18-person greedy fallback), and bill layout (row heights growing with content).

## Stack

React + Vite + Tailwind CSS + TypeScript. Pure frontend, no backend, zero server cost.
