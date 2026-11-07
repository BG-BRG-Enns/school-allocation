# Settings

**Change settings** on the registration page opens the form. What you can change depends on the status; the button later becomes **Change minimum minutes and swap period** and finally **Change swap period**.

![The Registration settings form: name, school year, project days with their attendance frame, registration period with start, end and late registration, swap period, choices per time block and places above the need](/bilder/en/einstellungen.png)

## Attendance frame per project day

Beside each project day is its **attendance frame**: the periods of the [timetable](/en/verwaltung/stundenraster) everyone is at school in that day, say **periods 2 to 6** on a sports day with short courses. With a frame, [Places and demand](./anlegen#places-and-demand) counts the day period by period; without one (**no frame**, the default) it counts the whole day, which suits days of full-day activities. The frame can be changed until registration opens.

## Minimum length of an activity per project day

Beside the attendance frame each project day has a **minimum length of an activity** in minutes, for example 180 on Tuesday and 100 on Wednesday; empty means none. An activity must credit at least that many minutes on the day, all its sessions together, counted as for the [minimum minutes per day](#minimum-minutes-per-day); the form does not accept a shorter one, and it tells teachers while they enter it where the activity stands. Exempt are activities for teachers only and the days of a session over a night; class activities are not. A minimum raised later changes nothing about activities already submitted or approved; only the next change of their sessions must reach it. [Reviewing submissions](./anlegen#review-submissions) shows where each activity stands. The minimum length can be changed until the registration opens.

## Registration period and late registration

- **Start**: Registration opens automatically at this time if the catalogue is published. **Open registration** opens it earlier.
- **End**: The registration period ends automatically at this time.
- **Late registration until**: optional. Anyone without complete choices by the end can submit them until this time. Late registration choices are considered after the others in the allocation. Without late registration, registration is over at the end.

One day before the registration period ends and one day before late registration ends, SchulWahl emails a reminder to everyone whose choices are not complete yet ([Email templates](./e-mail-vorlagen)).

## Swap period

**Swap period from** and **Swap period until**: During this time, students can move to an activity with open places after publication ([After publication](./nach-der-veroeffentlichung)). Without a swap period, there are no swaps. You can still enter it when publishing, as long as it has not started.

## Choices per time block

A **time block** is the activities on a project day that take place at the same time. In each time block, students rank as many activities as specified here. If a time block has fewer, they rank them all.

## Minimum minutes per day

For each year: how many minutes of activities students need on a project day. The allocation fills these minutes as well as possible; any shortfall is shown as missing minutes. What is credited is the lesson time of the periods an activity's sessions cover, without breaks: with periods of 50 minutes, five periods are 250 minutes, whether one activity fills them or two. Nobody enters these minutes; when the timetable changes, SchulWahl works them out again for registrations that have not opened yet. You cannot calculate an allocation without minimum minutes for every year in the registration; you can enter and change them until publication.

## Places above the need

By what percentage the activities should offer more places than students need, 20 unless you enter otherwise. **Places and demand** computes the target for each project day and year from it ([Setting up and the catalogue](./anlegen)). More places than needed leave room for the choices.

## Lock new offers

**Lock new offers once the target is reached** keeps the offers where places are missing: a teacher can submit an activity only if at least one cell of [Places and demand](./anlegen#places-and-demand) its places go to (every period it touches, times every year it is offered to, on each of its days) is still short of the target. The target is that of the **places above the need**; there is no second number. Only an activity all of whose cells have reached the target is refused; one that touches no cell is not checked. Class activities are exempt, extra places or not. The organisation may always create, submit and approve and sees a note only. An activity returned or taken back to draft is checked at its resubmission for the cells that get more places than at its last submission only: a correction locks nobody out. The lock is off until you turn it on, and can be changed until registration opens.

## Rules

A rule asks the students of a year (or only some of its classes) for at least so many activities or minutes from a category. How to set up rules and what they do is described under [Categories and rules](./kategorien-und-regeln).

## Teachers in the catalogue

**The catalogue names the teachers of the activities**: If unticked, students see no teacher names, either in the catalogue or when making their choices.

## What you can change when

| Setting | Can be changed until |
| ------- | -------------------- |
| Name, school year, project days | the catalogue is published |
| Attendance frame, minimum length of an activity, registration period, late registration, choices per time block, places above the need, lock new offers, rules, teachers in the catalogue | registration opens |
| Minimum minutes per day | the allocation is published |
| Swap period | the swap period starts |
