# Security policy

This software keeps identified records about children: who ranked what, who was assigned where, who holds which role. A flaw that shows one person another person's choices, lets someone change a ranking that is not theirs, or publishes an allocation the validator would refuse is serious even if it looks small. Thank you for reporting it privately.

## Reporting a vulnerability

Please do **not** open a public issue, discussion or pull request for a security problem.

Report it through GitHub's private vulnerability reporting: on the repository's **Security** tab, choose **Report a vulnerability**. If that is not possible for you, email <christoph.stadlbauer@brgenns.ac.at>.

Include what you can of the following:

- what an attacker can achieve, and under which role (nobody, a student, a teacher, an organizer, an administrator, someone with a database dump);
- steps to reproduce, or a proof of concept;
- the version or commit you tested.

This is a small project maintained in spare time. You can expect an acknowledgement within a week. We will keep you informed while we work on a fix, agree a disclosure date with you, and credit you in the advisory unless you prefer otherwise.

## Supported versions

Until the first release, only the `main` branch is supported. After that, security fixes go into the latest release only.

## Threat model

The people who sign in are the school's own: students, teachers and staff. They are curious, not hostile. A signed-in person may change an id in a URL to see what happens, so **every read is authorized per request**, and a gap there is in scope. The model does not assume that a signed-in person forges state-changing requests with another person's ids; a finding that needs that is still welcome, but is weighed against the organizational control (the school knows who everyone is, and every privileged action is audited).

In scope, among others:

- reading another person's choices, assignments, class or roles without a role that allows it;
- changing a ranking, an assignment, a role or the catalogue without the role, or outside the campaign state that allows it;
- an allocation published that violates a hard rule (capacity, overlap, eligibility, a pre-assignment), or whose published rows do not match the stored run they were published from. A change by hand after publication is the organizer's: it may override a full item, a minimum or a rule of the registration, is recorded as forced in the change log and the audit, and is not a vulnerability;
- bypassing authentication, or a session that outlives a block or a revoked role beyond the next request;
- an audit event that can be changed or removed, or a privileged action without one;
- a dependency or image that is not what the release workflow built and signed.

Out of scope:

- an operator with root access to the host or superuser access to the database; the deployment assumes the host runs the deployed software unmodified;
- denial of service through traffic volume;
- findings that require an outdated browser or a compromised device.

## Residual risks

- Under a path of a host it shares (`PUBLIC_URL` with a path), the app's defence against cross-site requests trusts the whole origin, so a page of another site on that host could send requests with a signed-in person's cookies; a host of its own keeps that boundary.
- Under a path, the session cookie cannot be `__Host-`, so another host of the same site can plant one in a person's browser. The app counts a session only beside a `__Host-` binding cookie of the browser it was started in, so a planted session or sign-in reads as none and nobody acts as someone else; while the planted cookie lasts, it can still keep that person signed out. A host of its own keeps that boundary too.
- A deployment updates itself from the images this repository publishes and verifies their signature, so what runs at a school is what the release workflow signed; the signing key is a secret of this repository, and whoever controls the repository's GitHub account controls what every school runs the next night. A release is a `v*` tag on `main`: a ruleset of the repository lets only the maintainer create one and nobody move or delete one, and the publish workflow refuses a tag whose commit is not on `main`, so a tag alone never publishes code that did not go through `main`'s review. The signature keeps a stolen package-write token, or a registry serving something else, from running an image the workflow did not sign, but not from serving an earlier signed release under the line tag. So a release that fixes a vulnerability in the app raises the schema version, which every earlier release refuses: an earlier release served that way does not start, the app stays down where someone sees it, and a school never goes back behind the fix. The PostgreSQL and solver images have no schema version: an earlier signed one can be served under its line tag, and only the app reaches either. None of this stands against that account.
- An optimizing allocation is not strategy-proof: a student can, in theory, gain by ranking dishonestly. The design shows no demand indicators and the school explains that honest ranking is the best strategy; this is a property of the mechanism, not a vulnerability.
