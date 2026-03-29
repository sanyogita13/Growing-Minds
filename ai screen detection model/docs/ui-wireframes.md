# UI Wireframes

## Visual Direction

- Minimal but not sterile
- Warm dark-neutral surfaces with electric cyan and amber status accents
- HD cards, live charts, and subtle motion instead of ornamental effects
- Large typography for status-critical information

## Candidate Flow

```text
+----------------------------------------------------------------------------------+
| Brand                         Interview Access                                   |
|----------------------------------------------------------------------------------|
| [ Secure login card ]          [ System status panel ]                           |
| Email / Invite Code            Camera: OK                                        |
| Password / OTP                 Mic: OK                                           |
| Join button                    Network: Stable                                   |
+----------------------------------------------------------------------------------+

+----------------------------------------------------------------------------------+
| Interview Room                                                                   |
|----------------------------------------------------------------------------------|
| [ Camera preview ]                 [ Session status ]                            |
| Monitoring active                  Recording on                                  |
| Identity verified                  Full-screen enforced                          |
|----------------------------------------------------------------------------------|
| Tips: stay visible, keep mic clear, do not switch tabs                           |
+----------------------------------------------------------------------------------+
```

## Admin Flow

```text
+----------------------------------------------------------------------------------+
| Admin Dashboard                                                                  |
|----------------------------------------------------------------------------------|
| Active interviews: 12   High risk: 2   Alerts today: 31   Avg latency: 88 ms    |
|----------------------------------------------------------------------------------|
| [ Live candidate grid ]                 [ Alert stream ]                         |
| Candidate A  Risk 22                    10:31:22  Multiple voices                |
| Candidate B  Risk 87                    10:31:24  Full-screen exit               |
| Candidate C  Risk 11                    10:31:30  Gaze away excessive            |
|----------------------------------------------------------------------------------|
| [ Risk trend chart ]                   [ Session controls ]                      |
| Pause, warn, review evidence, end session                                        |
+----------------------------------------------------------------------------------+
```

## Scheduling Flow

```text
+------------------------------------------------------------------+
| Create Interview Slot                                            |
|------------------------------------------------------------------|
| Candidate      [________________________]                        |
| Interviewer    [________________________]                        |
| Date / Time    [____] [____]  Time Zone [Asia/Kolkata   v]       |
| Duration       [45 min v]                                        |
| Monitoring     [High integrity mode v]                           |
| Invite         [Send secure link]                                |
+------------------------------------------------------------------+
```

## Motion Guidance

- Stagger list and card entrance animations under 250 ms
- Live risk ring updates every second with eased interpolation
- Alert panel items slide in from the right
- Candidate status pulses only for warnings, not for normal activity
