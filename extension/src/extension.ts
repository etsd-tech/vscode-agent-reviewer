import * as vscode from 'vscode';
import { ReviewCommentController } from './commentController';
import { submitReview } from './reviewSubmitter';
import { ensureClaudeProvisioned } from './claudeInstaller';
import { createStatusBar } from './statusBar';

let commentController: ReviewCommentController | undefined;

export function activate(context: vscode.ExtensionContext) {
  commentController = new ReviewCommentController(context);

  try {
    ensureClaudeProvisioned(context.extensionPath);
  } catch (err) {
    console.warn('Failed to provision Claude Code integration:', err);
  }

  createStatusBar(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('vscodeReviewer.submitReview', () => {
      if (commentController) {
        submitReview(commentController);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'vscodeReviewer.commentAndSubmit',
      (reply: vscode.CommentReply) => {
        if (commentController) {
          commentController.addComment(reply);
          submitReview(commentController);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vscodeReviewer.clearComments', () => {
      commentController?.clearAll();
      vscode.window.showInformationMessage('Review comments cleared.');
    })
  );
}

export function deactivate() {
  commentController?.dispose();
}
