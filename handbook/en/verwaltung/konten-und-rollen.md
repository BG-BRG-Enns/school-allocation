# Accounts and roles

An **account** is created when someone first signs in with their school Microsoft account. A **person** is an entry in the [class lists](./klassenlisten). SchulWahl links each account to a person once and recognises it from then on, even if the name or address changes. A **role** gives an account special permissions. The class lists say who is a student or teacher; no role is needed for that.

## Accounts

![The accounts with a filter and table, followed by the roles with the person, role, when it was granted and by whom](/bilder/en/konten-und-rollen.png)

The table shows every account with its name, email address, last sign-in and the person it is linked to. Filter by name or email, or tick **only unlinked** to find accounts that are not linked to anyone yet.

## Linking an account

![An unlinked account, followed by the form: the person found in the class lists, a reason and the Link button](/bilder/en/konto-zuordnen.png)

An account stays unlinked if the class lists do not recognise it: the CSV file gives a different address, or the Microsoft account has been created afresh. The person then sees on **My account** that they should contact the administration.

1. Click **Link** in the account's row.
2. Find the person from the class lists by name, class or email address and select them.
3. Write a **Reason** and click **Link**.

If the person already had another account, this is shown; the old link is removed. SchulWahl never links by name, and people from Entra groups are already linked to their accounts.

## Roles

| Role | What it allows |
| ---- | -------------- |
| **Administration** | Everything under Administration, plus everything the organisation may do |
| **Organisation** | Manage registrations: catalogue, registration period, allocation, publication and later changes; assign class teachers and change email templates |
| **Read-only** | View information, for an audit for example: lists, Excel files and retention; it cannot change anything |

### Granting a role

![The Grant a role form with the Organisation role and a reason](/bilder/en/rolle-erteilen.png)

Only someone who has already signed in can receive a role. Click **Role** in the account's row, choose the role, write a reason and click **Grant role**. The role takes effect when the person next loads a page.

### Revoking a role

The **Roles** table shows every granted role, with the time and the person who granted it. **Revoke** takes it back with a reason. Two rules protect the school from being left without administration: only someone else can revoke your own administration role, and the last administration role cannot be revoked. Give someone else the administration role first.

## Blocking

**Block** blocks an account with a reason, from the next page load, even during a session. The person then sees that their access is blocked. **Unblock** lifts the block. You cannot block yourself. This does not affect the Microsoft account.

SchulWahl records every change on this page: what, when, by whom and with what reason.
