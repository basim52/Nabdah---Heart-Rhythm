# Security Specification - Nabda (Heart Beat)

## 1. Data Invariants
* **User Profiles**: User documents can only be created by the registered owner, and can only be updated if `request.auth.uid == userId`. No one can write a "Ghost Field" (e.g. `role` admin) since we restrict fields and strictly validate schema.
* **Friendships**: Users can only create friendships if they are one of the two participants (`user1` or `user2`). Deleting or updating can only be done by either participant.
* **Invitations**: Only the user designated as `senderId` can create a `pending` invitation. Only the user designated as `receiverId` can update invitation `status` to `accepted` or `declined`.

## 2. The "Dirty Dozen" (Malicious Payloads to Block)
1. **User Spoofing**: Attempt to write a user profile with `uid: "alice_unauthorized"` while signed in as `bob`.
2. **Ghost Admin Roll**: Bob attempts to update his own profile to add a `role: "admin"` field.
3. **Blanket Profile Scraping**: Trying to query the complete list of users without specifying constraints or fetching someone's private PII anonymously.
4. **Foreign Friendship Creation**: Alice attempts to create a friendship doc where `user1` is "bob" and `user2` is "charlie".
5. **Friendship Status Hijack**: Bob attempts to force check a pending friendship request they did not write to instantly "accepted".
6. **False Friendship Modification**: Charlie attempts to modify Alice and Bob's friendship metadata keys.
7. **Foreign Invitation Creation**: Malicious user creates an invitation with `senderId: "bob"` without being Bob.
8. **Invitation Hijack Acceptance**: Alice invites Bob; Charlie intercepts the document and updates `status` to `accepted`.
9. **Instant Room Poisoning**: Enacting 1.5KB long messy symbols as a websocket `roomCode` in database.
10. **Malicious Client Timestamping**: User attempts to set `createdAt` or `updatedAt` value using custom client string instead of `request.time`.
11. **Massive Payload Injection**: Alice injects a 5MB payload into a displayName or status.
12. **Zombie Invitation Revivification**: Bob attempts to reset an invitation back to "pending" after Alice has already completed/joined.
