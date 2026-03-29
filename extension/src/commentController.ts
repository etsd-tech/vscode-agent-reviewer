import * as vscode from 'vscode';

export interface ReviewComment {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  body: string;
}

const STATE_KEY = 'reviewComments';

interface PersistedState {
  threads: { uri: string; lineStart: number; lineEnd: number; bodies: string[] }[];
  general: string[];
}

export class ReviewCommentController {
  private controller: vscode.CommentController;
  private threads: vscode.CommentThread[] = [];
  private generalComments: string[] = [];
  private state: vscode.Memento;

  constructor(context: vscode.ExtensionContext) {
    this.state = context.workspaceState;
    this.controller = vscode.comments.createCommentController(
      'code-review',
      'Code Review'
    );
    this.controller.options = {
      prompt: 'Comment',
      placeHolder: 'Your feedback…',
    };
    this.controller.commentingRangeProvider = {
      provideCommentingRanges: (
        document: vscode.TextDocument
      ): vscode.Range[] => {
        const lineCount = document.lineCount;
        return [new vscode.Range(0, 0, lineCount - 1, 0)];
      },
    };

    context.subscriptions.push(this.controller);

    context.subscriptions.push(
      vscode.commands.registerCommand(
        'vscodeReviewer.createComment',
        (reply: vscode.CommentReply) => {
          this.addComment(reply);
        }
      ),
      vscode.commands.registerCommand(
        'vscodeReviewer.deleteComment',
        (comment: vscode.Comment) => {
          this.deleteComment(comment);
        }
      )
    );

    this.restore();
  }

  private persist() {
    const data: PersistedState = {
      threads: this.threads.map((t) => ({
        uri: t.uri.toString(),
        lineStart: t.range?.start.line ?? 0,
        lineEnd: t.range?.end.line ?? 0,
        bodies: t.comments.map((c) =>
          typeof c.body === 'string' ? c.body : c.body.value
        ),
      })),
      general: this.generalComments,
    };
    this.state.update(STATE_KEY, data);
  }

  private restore() {
    const data = this.state.get<PersistedState>(STATE_KEY);
    if (!data) return;

    this.generalComments = data.general ?? [];

    for (const saved of data.threads) {
      const uri = vscode.Uri.parse(saved.uri);
      const range = new vscode.Range(saved.lineStart, 0, saved.lineEnd, 0);
      const thread = this.controller.createCommentThread(uri, range, []);
      thread.comments = saved.bodies.map((body) => ({
        body,
        mode: vscode.CommentMode.Preview,
        author: { name: 'You' },
        contextValue: 'canDelete',
      }));
      this.threads.push(thread);
    }
  }

  addComment(reply: vscode.CommentReply) {
    const thread = reply.thread;
    const comment: vscode.Comment = {
      body: reply.text,
      mode: vscode.CommentMode.Preview,
      author: { name: 'You' },
      contextValue: 'canDelete',
    };
    thread.comments = [...thread.comments, comment];
    if (!this.threads.includes(thread)) {
      this.threads.push(thread);
    }
    this.persist();
  }

  addGeneralComment(text: string) {
    this.generalComments.push(text);
    this.persist();
  }

  deleteComment(comment: vscode.Comment) {
    for (const thread of this.threads) {
      const remaining = thread.comments.filter((c) => c !== comment);
      if (remaining.length === thread.comments.length) continue;
      thread.comments = remaining;
      if (remaining.length === 0) {
        thread.dispose();
        this.threads = this.threads.filter((t) => t !== thread);
      }
      this.persist();
      return;
    }
  }

  getAllComments(): ReviewComment[] {
    const comments: ReviewComment[] = [];
    for (const text of this.generalComments) {
      comments.push({ filePath: '', lineStart: -1, lineEnd: -1, body: text });
    }
    for (const thread of this.threads) {
      if (thread.comments.length === 0) continue;
      const filePath = thread.uri.fsPath;
      const lineStart = thread.range?.start.line ?? 0;
      const lineEnd = thread.range?.end.line ?? 0;
      const body = thread.comments
        .map((c) => (typeof c.body === 'string' ? c.body : c.body.value))
        .join('\n');
      comments.push({ filePath, lineStart, lineEnd, body });
    }
    return comments;
  }

  clearAll() {
    for (const thread of this.threads) {
      thread.dispose();
    }
    this.threads = [];
    this.generalComments = [];
    this.persist();
  }

  dispose() {
    this.clearAll();
    this.controller.dispose();
  }
}
