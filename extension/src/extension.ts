import * as vscode from 'vscode';
import { ReviewCommentController } from './commentController';

let commentController: ReviewCommentController | undefined;

export function activate(context: vscode.ExtensionContext) {
  commentController = new ReviewCommentController(context);

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
