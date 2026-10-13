# Accountability release readiness

## Confirmed Farmingdale rules

- Accountability uses a rolling 60-day period.
- The confirmed ladder is Coaching at 10 points, Verbal Warning at 20, Written Warning at 30, 1 Week Suspension at 40, and Employment Review at 50.
- The 2026-09-26 KitchenIQ screenshots confirm these infraction types and points: Excused Call Out (0), Coaching (0), Uniform/Appearance 1st Coaching (0), Uniform/Appearance 2nd Coaching (0), Excused Lateness (0), Performance Coaching (P5) (0), Missing Thermometer (1), Time Theft (P4) (4), Late to Shift (5-30 Mins) (P3&4) (5), Uniform/Appearance Violation (P13-15) (5), Late to Shift (30+ Mins) (P3&4) (8), Call Out (P3&4) (10), Violation of Standard Procedures (P5&6) (10), Insubordination (P5&6) (10), Cash Shortage (Cash & Coupon Policy) (10), Performance (P5) (20), No Call No Show (P3&4) (30), and Food/Property/Money Theft (P6) (40).
- A recipient can see their own infraction, points, note, and disciplinary actions, but never the issuer.
- Accountability events create in-app notifications only. They do not route to Discord.

## Release safeguards implemented

- Recipient reads use the `my_infractions` view, which omits `issued_by`; the base table remains manager-only for audit.
- Infraction writes are now action-only. Direct table writes through PostgREST are denied so a leader cannot forge point values, issuer identity, or an audit-history edit outside the validated server workflow.
- Issuance rejects self-issuance, uses the active type's stored points, and suppresses a near-immediate duplicate submission.
- Pending disciplinary rungs have a database uniqueness guard, so concurrent issuance cannot create duplicate open actions.

## Store decisions still needed

- Confirm whether any additional infraction types appear below the final screenshot. Do not add types or point values that are not confirmed in KitchenIQ.
- Confirm the permission map for each Farmingdale role, especially exactly which leaders receive `accountability.issue` and which roles receive `accountability.manage`.
- Confirm whether a pending disciplinary action should automatically expire after active points fall below its threshold. The current nightly job does this, but the architecture identifies it as an interpretation that needs product approval.
- Confirm whether an employee acknowledgement is the desired workflow and whether leaders need a separate recorded acknowledgement or resolution step.
- Confirm the correction/void process for an issued infraction. Records are now intentionally append-only; no deletion or direct edit path is provided.
