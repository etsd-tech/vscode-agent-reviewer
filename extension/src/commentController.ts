import * as vscode from 'vscode';

export interface ReviewComment {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  body: string;
}

export class ReviewCommentController {
  private controller: vscode.CommentController;
  private threads: vscode.CommentThread[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.controller = vscode.comments.createCommentController(
      'vscode-review',
      'Code Review'
    );
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
          this.createComment(reply);
        }
      )
    );
  }

  private createComment(reply: vscode.CommentReply) {
    const thread = reply.thread;
    const comment: vscode.Comment = {
      body: reply.text,
      mode: vscode.CommentMode.Preview,
      author: { name: 'You' },
    };
    thread.comments = [...thread.comments, comment];
    if (!this.threads.includes(thread)) {
      this.threads.push(thread);
    }
  }

  getAllComments(): ReviewComment[] {
    const comments: ReviewComment[] = [];
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
  }

  dispose() {
    this.clearAll();
    this.controller.dispose();
  }
}
