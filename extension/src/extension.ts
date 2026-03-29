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
        submitReview(commentController, context);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'vscodeReviewer.commentAndSubmit',
      (reply: vscode.CommentReply) => {
        if (commentController) {
          commentController.addComment(reply);
          submitReview(commentController, context);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vscodeReviewer.addGeneralComment', async () => {
      const text = await vscode.window.showInputBox({
        prompt: 'General comment (not tied to any code)',
        placeHolder: 'Your feedback…',
      });
      if (text) {
        commentController?.addGeneralComment(text);
        vscode.window.showInformationMessage('General comment added.');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vscodeReviewer.clearComments', async () => {
      const answer = await vscode.window.showWarningMessage(
        'Clear all review comments?',
        { modal: true },
        'Clear'
      );
      if (answer === 'Clear') {
        commentController?.clearAll();
      }
    })
  );
}

export function deactivate() {
  commentController?.dispose();
}
