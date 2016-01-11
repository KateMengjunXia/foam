/**
 * @license
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

CLASS({
  package: 'com.google.ymp.ui',
  name: 'PostView',
  extends: 'foam.u2.View',

  requires: [
    'com.google.ymp.ui.ColorPicker',
    'com.google.ymp.ui.DynamicImageLoader',
    'com.google.ymp.bb.Reply',
  ],
  imports: [
    'replyDAO',
  ],
  exports: [
    'as self',
  ],

  properties: [
    {
      name: 'data',
      postSet: function(old,nu) {
        if ( nu ) {
          this.replies = this.replyDAO.where(EQ(this.Reply.PARENT, nu.id));
        }
      }
    },
    {
      type: 'DAO',
      name: 'replies',
      toPropertyE: 'foam.u2.DAOController',
    }
  ],

  templates: [
    function initE() {/*#U2
      <div class="$">
        <div class="$-flex-col">
          <:image width="100%" />
          <div class="$-content">{{ this.data.content$ }}</div>
          <div class="$-author">Posted by&nbsp;<:author /></div>
          <div class="$-separator"></div>
          <div><:contact /></div>
          <div class="$-separator"></div>
          <div class="$-reply-title">Replies</div>
          <self:replies />
        </div>
      </div>
    */},
    function CSS() {/*
      $-flex-col {
        display: flex;
        flex-direction: column;
        padding: 16px;
      }
      $-author {
        text-align: right;
        margin-bottom: 4px;
        opacity: 0.54;
      }
      $-separator {
        border-bottom: 1px solid #e0e0e0;
        margin-bottom: 4px;
      }
      $-content {
        padding: 8px 0px;
      }
      $-reply-title {
        margin: 8px;
        font-size: 20px;
        color: rgba(0,0,0,0.54);
      }
    */},
  ]
});