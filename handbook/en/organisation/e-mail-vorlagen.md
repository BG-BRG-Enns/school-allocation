# Email templates

SchulWahl sends emails at set points in a registration. Their texts come from the templates, which the administration and organisation can change: under **Administration** → **Email templates**, or from a registration's page. Emails go to the addresses in the class lists; anyone without an address there receives none.

| Template | When | To whom |
| -------- | ---- | ------- |
| Registration invitation | when registration opens | all participating students |
| Reminder before registration closes | one day before the registration period ends | anyone still without complete choices |
| Late registration invitation | at the end of the registration period, if late registration follows | anyone still without complete choices |
| Reminder before late registration closes | one day before late registration ends | anyone still without complete choices |
| Deadline missed | at the end of registration | anyone who has not submitted complete choices |
| Missing choices, to the class teacher | at the end of the registration period and at the end of registration | class teachers, with their class's list |
| Allocation published | on publication | all students, with their programme |
| Not fully placed, to the class teacher | on publication | class teachers, with their class's list |
| Activity cancelled, to the teachers | on publication | teachers of a cancelled activity |
| Swap confirmed | after a swap | the person who swapped |
| Allocation changed (by the class teacher or the organisation) | after a placement by the class teacher or a change by hand | the person whose allocation changed |

## Editing a template

![A template being edited: subject and body with placeholders, and the template's clickable placeholders alongside](/bilder/en/e-mail-vorlage.png)

**Edit** opens the subject and body. SchulWahl fills placeholders in double curly braces, such as <code v-pre>{{first_name}}</code>, when sending; beside the form is an explanation of each one. Clicking a placeholder inserts it where the cursor last was, in the subject or body. Each template only knows its own placeholders; SchulWahl rejects any other when saving.

After you **Save**, the template is marked “School’s own text”. **Reset** deletes it again, and the default text applies.

## Test email

**Test email to me** sends the template to your address, with sample values in every placeholder. If the top says that sending email is not configured on this server, all emails wait until it is; the operator can configure it.

## The templates' language

The default texts use the school's language. A text saved by the school stays in the language it was written in. If the administration changes the school's language, the page flags each such text: translate it or reset it.
