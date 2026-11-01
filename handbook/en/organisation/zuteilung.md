# Allocation

Once registration has ended, SchulWahl calculates the allocation: a placement for everyone that meets every condition. No activity gets more students than places (a class activity gets its whole classes plus at most its extra places), no person's two activities overlap, every activity only gets students from a suitable year or class, and a class activity keeps its whole classes. The calculation places students in an activity with a cost only if they chose it, apart from the whole classes of a class activity, and never on a remaining place.

Within these conditions, the calculation pursues its goals in this order:

1. As few people as possible are left without a full week, meaning the minimum minutes on every project day.
2. As few minutes as possible are missing overall.
3. If the registration has [rules](./kategorien-und-regeln): as few students as possible miss a rule, and as few activities and minutes as possible are missing for rules overall.
4. As few students as possible get lower choices on average.
5. The overall result is as good as possible: choices as high as possible for everyone.
6. Where two allocations are equally good, a draw decides.

If a person's choices are not enough, for the minutes or for a rule, they get a **remaining place**: an open place in an activity with no cost. An activity marked “Cancelled if too few” can be cancelled if too few students can be found to meet its minimum. Late registration choices are considered in a second **round**, after everyone else.

Before the first calculation, every year in the registration needs its minimum minutes per day ([Settings](./einstellungen)).

## Calculating

![New calculation with draw number and computing time, followed by calculations with status, draw number, computing time and missing minutes](/bilder/en/zuteilung-berechnen.png)

**Allocation** on the registration page opens the calculations page.

- **Draw number (blank: drawn for you)**: This decides how ties are settled. If left blank, SchulWahl draws one.
- **Computing time per goal (1–60)**: More computing time is more likely to find the best allocation, but takes longer.

**Calculate allocation** starts the calculation; after a few minutes, depending on the computing time and the size of the school, it appears in the **Calculations** list. **Repeat** starts a calculation again with the same draw number and computing time; it may come out differently. You can make as many calculations as you like, for example with different draw numbers, and compare them.

If the page says that allocation calculation is not configured on this server or that the calculation service is not responding, that is the operator's responsibility.

## Reviewing a calculation

![The review of a calculation: Publish at the top, followed by draw number and computing time, the calculation's figures and the goals with their values for each round](/bilder/en/zuteilung-pruefen.png)

A finished calculation first shows its figures: how many students are placed for every day, how many have missing minutes, how many have a remaining place, how many miss a rule, and how many activities are cancelled. Below are the **Goals (in this order)** with their value for each round. “✓ optimal” means there is no better allocation; “≈ perhaps not optimal” means the computing time was not enough to prove this. More computing time often helps then.

Further down:

- **Choices**: how often choice 1, 2, 3, a remaining place or a class activity was allocated;
- **Missing minutes**: who is missing how much time on which day;
- **Remaining places**: who has a remaining place and where;
- **Rules**: for each rule, how many meet it, and under **Missing rules**, who misses which and by how much;
- **Activities**: the students placed, whole classes and minimum for each activity, and which is cancelled or left empty;
- **Classes**: for each class, how many students have missing minutes, how many have a remaining place and how many miss a rule;
- **Students**: each person with their activities, average choice and the rules they miss.

**Calculation as Excel** provides all this as a spreadsheet ([Excel files](./excel)).

If a **Note before calculation** appears above the calculation, fewer students are eligible for an activity than its minimum requires, and it cannot be cancelled. If the calculation then finds no allocation, this is usually why: allow cancellation, lower the minimum or withdraw the activity. A **Note on the rules** says that for a rule the category's places are not enough for all students of a year; the calculation then meets it as far as it can. If the catalogue, an activity's categories, the class lists or a class activity have changed since a calculation, the page says so; recalculate before publishing.

## Comparing two calculations

![The comparison of two calculations: a choice of the other calculation, followed by the number of students with a different allocation](/bilder/en/zuteilung-vergleich.png)

Under **Comparison**, choose another calculation with **With calculation**. The page then shows how many students have a different allocation, and each person's activities in both calculations. The goals get a column showing the difference.

## Publishing

![Publishing: the cancelled activities, the confirmation checkbox and the Publish now button](/bilder/en/veroeffentlichen.png)

The **Publish calculation …** button above a calculation, with its number, opens the confirmation. If activities are cancelled, they are listed there, and you confirm them with the checkbox. **Publish now** makes the calculation the registration's allocation:

- Students receive their programme by email and see it in SchulWahl.
- Class teachers receive the list of those not yet placed for every day.
- Teachers of a cancelled activity are notified.

There are no more recalculations after that. [After publication](./nach-der-veroeffentlichung) describes what can still change.

![The Published section: which calculation is the allocation, since when, and the allocation and attendance as Excel](/bilder/en/veroeffentlicht.png)
