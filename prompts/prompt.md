# TinyWins — Fix Level Entry Keyboard Visibility and Level Count Copy

Fix two issues in the existing creation/edit flow.

## 1. Keep the active level textbox visible above the keyboard

Current problem:
When someone is adding or editing rating levels, the keyboard can cover the active textbox, so the user cannot clearly see what they are typing.

Required behaviour:
- When a level input receives focus, automatically shift/scroll the form so the active textbox remains fully visible above the keyboard.
- Apply this to all level-name inputs in the create flow and edit flow.
- Support both Android and iOS.
- Preserve normal scrolling when the keyboard is closed.
- Do not cause large jumps, flicker or repeated auto-scrolling.
- Respect safe areas and existing bottom controls.
- If the screen uses a ScrollView, KeyboardAvoidingView, KeyboardAwareScrollView or equivalent, use the existing architecture where practical instead of adding competing keyboard-management logic.
- Tapping between different level inputs should keep the newly focused field visible.
- Tapping outside or submitting should dismiss the keyboard normally.

Test on small screens, especially when editing the 4th and 5th level.

## 2. Fix the incorrect “7 levels” copy

TinyWins now supports a maximum of 5 rating levels.

Audit the create/edit flow for stale text that still mentions 7 levels.

Replace any incorrect copy with wording consistent with the current limit of 5.

Examples:
- “Add up to 5 levels”
- “You can add 3 to 5 levels”

Use whichever matches the existing flow and minimum-level rules.

Do not change the actual level-limit logic unless it is inconsistent with the current product rule:
- minimum: preserve the existing valid minimum
- maximum: 5 levels

## Scope

Do not redesign the form.
Do not change rating calculations, historical data, database schema or unrelated screens.

After implementation, report:
1. Which components were changed.
2. How keyboard avoidance/scroll-to-focused-input was implemented.
3. Where the stale 7-level copy was found and corrected.
4. Tests performed on Android and iOS.
