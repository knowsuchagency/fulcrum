
## Vibora Task Management

You are working inside a Vibora task worktree. Use the `vibora` CLI to manage this task:

```bash
# View current task info
vibora current-task

# Associate a PR with this task (enables auto-completion when merged)
vibora current-task pr https://github.com/owner/repo/pull/123

# Associate a Linear ticket with this task
vibora current-task linear https://linear.app/team/issue/TEAM-123

# Mark task ready for review (sends notification)
vibora current-task review

# Send a notification to the user
vibora notify "Title" "Message body"
```

When you create a PR for this work, run `vibora current-task pr <url>` to link it.
The task will automatically complete when the PR is merged (you cannot mark it done manually).

### Notifications

Moving to review automatically sends a notification:

```bash
vibora current-task review    # Notifies: "Task Ready for Review"
```

For other communications (questions, issues, or anything not a status change), use:

```bash
vibora notify "Title" "Message body"
```
