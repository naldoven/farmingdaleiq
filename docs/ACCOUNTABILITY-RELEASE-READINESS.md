# Accountability release readiness

## Confirmed Farmingdale rules

- Accountability uses a rolling 60-day period.
- The confirmed ladder is Coaching at 10 points, Verbal Warning at 15, Written Warning at 20, 1 Week Suspension at 30, and Employment Review at 50.
- The confirmed portion of the infraction list is seeded from KitchenIQ: Call Out (P3&4), No Call No Show (P3&4), Late to Shift 5-30 mins (P3&4), Excused Call Out, Coaching, Time Theft (P4), and Violation of Standard Procedures (P5&6).
- A recipient can see their own infraction, points, note, and disciplinary actions, but never the issuer.
- Accountability events create in-app notifications only. They do not route to Discord.

## Release safeguards implemented

- Recipient reads use the `my_infractions` view, which omits `issued_by`; the base table remains manager-only for audit.
- Infraction writes are now action-only. Direct table writes through PostgREST are denied so a leader cannot forge point values, issuer identity, or an audit-history edit outside the validated server workflow.
- Issuance rejects self-issuance, uses the active type's stored points, and suppresses a near-immediate duplicate submission.
- Pending disciplinary rungs have a database uniqueness guard, so concurrent issuance cannot create duplicate open actions.

## Store decisions still needed

- Complete the tail of the KitchenIQ infraction list before it is seeded. Do not add unconfirmed types or point values.
- Confirm the permission map for each Farmingdale role, especially exactly which leaders receive `accountability.issue` and which roles receive `accountability.manage`.
- Confirm whether a pending disciplinary action should automatically expire after active points fall below its threshold. The current nightly job does this, but the architecture identifies it as an interpretation that needs product approval.
- Confirm whether an employee acknowledgement is the desired workflow and whether leaders need a separate recorded acknowledgement or resolution step.
- Confirm the correction/void process for an issued infraction. Records are now intentionally append-only; no deletion or direct edit path is provided.
