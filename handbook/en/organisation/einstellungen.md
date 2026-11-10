# Settings

**Change settings** on the registration page opens the form. What you can change depends on the status; the button later becomes **Change minimum minutes and swap period** and finally **Change swap period**.

![The Registration settings form: name, school year, project days with their attendance frame, registration period with start, end and late registration, swap period, choices per time block and extra places to offer](/bilder/en/einstellungen.png)

## Attendance frame per project day

Beside each project day is its **attendance frame**: the periods of the [timetable](/en/verwaltung/stundenraster) in which, on that day, every student takes part in an activity or is at school, say **periods 2 to 5**. The frame runs from the start of its first period to the end of its last, the breaks between them included. Without a frame (**no frame**, the default) the time from the first to the last period of the timetable applies.

This time is what counts:

- On a day, an activity counts its minutes within the frame, by the clock. Nobody knows whether the teacher takes a break or works through, so breaks within the frame count; what lies before, after or overnight does not. With the frame periods 2 to 5 (8:30 to 12:15), a trip from 8:45 to 10:30 counts 105 minutes, one from 9:00 to 13:00 counts 195.
- The [minimum minutes per day](#minimum-minutes-per-day), the [minimum length of an activity](#minimum-length-of-an-activity-per-project-day) and the rules in minutes ([Categories and rules](./kategorien-und-regeln)) compute with these minutes.
- [Places and demand](./anlegen#places-and-demand) counts a day with a frame period by period, and a day without one in a single column over the same time.

An activity that falls into this time on no day, a theatre visit in the evening, say, is an **extra**: it counts no minutes and no places, students do not choose it, and the allocation places nobody in it. The catalogue lists it with "Extra: sign up with the teacher"; its teachers bring students in under **Placed directly**, and the organisation can do so there too. Swaps and class teachers do not offer an extra, since it fills no gap.

The frame can be changed until registration opens. When it changes, SchulWahl counts the minutes of this registration's sessions again.

## Minimum length of an activity per project day

Beside the attendance frame each project day has a **minimum length of an activity** in minutes, for example 180 on Tuesday and 100 on Wednesday; empty means none. On every day on which an activity takes up time in the [attendance frame](#attendance-frame-per-project-day), it must last at least that long there, all its sessions on the day together. A shorter one cannot be saved, not even as a draft; the form tells teachers while they enter it by how many minutes to lengthen it. Exempt are activities for teachers only; class activities are not.

A trip over a night, too, must reach the minimum length on its day of return as soon as it reaches into the frame: with the frame from 8:30 and a minimum length of 100 minutes, a trip that is back by 8:30 is free on its day of return and is not checked there; one that is back at 8:45 takes up 15 minutes and is too short. Whether a teacher who does more elsewhere deserves an exception is for the organisation to decide, not SchulWahl.

A minimum raised later changes nothing about activities already submitted or approved; only the next change of their sessions must reach it. The same holds when a changed frame or a changed timetable shortens an activity's minutes: SchulWahl counts them again but does not check again. [Reviewing submissions](./anlegen#review-submissions) shows, for every activity that is too short, by how much. The minimum length can be changed until the registration opens.

### What the settings mean together

Minimum minutes, minimum length and frame work together; SchulWahl does not work this out for you. Two examples with 200 minimum minutes and a minimum length of 200 minutes:

- Frame **periods 2 to 6** (8:30 to 13:10, 280 minutes): every activity lasts at least 200 minutes, so two do not fit in. On this day the students are in one activity and wait at school until it starts or until they may go home.
- Frame **periods 2 to 5** (8:30 to 12:15, 225 minutes): during the frame the students are in exactly one activity.

Shorter courses on a day come only with a smaller minimum length, such as 100 minutes for two courses in the morning.

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

For each year: how many minutes of activities students need on a project day. The allocation fills these minutes as well as possible; any shortfall is shown as missing minutes. What counts is the activities' time in the [attendance frame](#attendance-frame-per-project-day), breaks included: from period 2 to the end of period 6 it is 280 minutes (8:30 to 13:10), whether one activity fills it or two. Nobody enters these minutes; when the timetable or the frame changes, SchulWahl counts them again for registrations that have not opened yet. You cannot calculate an allocation without minimum minutes for every year in the registration; you can enter and change them until publication.

## Extra places to offer

By what percentage the activities should offer more places than students need, 20 unless you enter otherwise: with 20%, 120 places are planned for every 100 students who need one. **Places and demand** computes the target for each project day and year from it ([Setting up and the catalogue](./anlegen)). More places than needed leave room for the choices.

## Lock new offers

**Lock new offers once the target is reached** keeps the offers where places are missing: a teacher can submit an activity only if at least one cell of [Places and demand](./anlegen#places-and-demand) its places go to (every period it touches, times every year it is offered to, on each of its days) is still short of the target. The target is that of the **extra places to offer**; there is no second number. Only an activity all of whose cells have reached the target is refused; one that touches no cell is not checked. Class activities are exempt, extra places or not. The organisation may always create, submit and approve and sees a note only. An activity returned or taken back to draft is checked at its resubmission for the cells that get more places than at its last submission only: a correction locks nobody out. The lock is off until you turn it on, and can be changed until registration opens.

## Submitted activities for all teachers

**Teachers also see the activities others have submitted**: If unticked, a teacher sees of the others only what you have already approved. If two teachers submit the same thing, say chess for the same year, they notice only after your approval. If ticked, the activities others have submitted are in their table already, with the state "Submitted", and the two can talk to each other. Only its own teachers and you can change one, as before. Drafts, returned ones included, and withdrawn activities are only ever seen by their teachers and the organisation.

## Rules

A rule asks the students of a year (or only some of its classes) for at least so many activities or minutes from a category. How to set up rules and what they do is described under [Categories and rules](./kategorien-und-regeln).

## Teachers in the catalogue

**The catalogue names the teachers of the activities**: If unticked, students see no teacher names, either in the catalogue or when making their choices.

## What you can change when

| Setting | Can be changed until |
| ------- | -------------------- |
| Name, school year, project days | the catalogue is published |
| Attendance frame, minimum length of an activity, registration period, late registration, choices per time block, extra places to offer, lock new offers, submitted activities for all teachers, rules, teachers in the catalogue | registration opens |
| Minimum minutes per day | the allocation is published |
| Swap period | the swap period starts |
