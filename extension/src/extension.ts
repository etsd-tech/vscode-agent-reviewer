import * as vscode from 'vscode';
import { ReviewCommentController } from './commentController';
import { submitReview } from './reviewSubmitter';
import { ensureChannelRegistered } from './channelInstaller';

let commentController: ReviewCommentController | undefined;

export function activate(context: vscode.ExtensionContext) {
  commentController = new ReviewCommentController(context);

  try {
    ensureChannelRegistered(context.extensionPath);
  } catch (err) {
    console.warn('Failed to register channel server:', err);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('vscodeReviewer.submitReview', () => {
      if (commentController) {
        submitReview(commentController);
      }
    })
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
