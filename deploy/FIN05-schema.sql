IF OBJECT_ID(N'[__EFMigrationsHistory]') IS NULL
BEGIN
    CREATE TABLE [__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113080809_InitialCustomers'
)
BEGIN
    CREATE TABLE [Customers] (
        [CustomerId] bigint NOT NULL IDENTITY,
        [CustomerCode] nvarchar(30) NOT NULL,
        [CustomerName] nvarchar(200) NOT NULL,
        [TaxCode] nvarchar(30) NULL,
        [Phone] nvarchar(20) NULL,
        [Email] nvarchar(254) NULL,
        [Address] nvarchar(500) NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_Customers] PRIMARY KEY ([CustomerId])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113080809_InitialCustomers'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Customers_CustomerCode] ON [Customers] ([CustomerCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113080809_InitialCustomers'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261113080809_InitialCustomers', N'10.0.15');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083558_CustomerConcurrency'
)
BEGIN
    ALTER TABLE [Customers] ADD [RowVersion] rowversion NOT NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113083558_CustomerConcurrency'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261113083558_CustomerConcurrency', N'10.0.15');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113090811_AppUsersAndAuditLogs'
)
BEGIN
    CREATE TABLE [AppUsers] (
        [UserId] bigint NOT NULL IDENTITY,
        [KeycloakSubject] nvarchar(64) NOT NULL,
        [FullName] nvarchar(150) NOT NULL,
        [Email] nvarchar(254) NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_AppUsers] PRIMARY KEY ([UserId])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113090811_AppUsersAndAuditLogs'
)
BEGIN
    CREATE TABLE [AuditLogs] (
        [AuditLogId] bigint NOT NULL IDENTITY,
        [UserId] bigint NULL,
        [Action] nvarchar(100) NOT NULL,
        [EntityName] nvarchar(100) NOT NULL,
        [EntityId] nvarchar(64) NULL,
        [ActionTime] datetime2 NOT NULL,
        [Description] nvarchar(max) NULL,
        CONSTRAINT [PK_AuditLogs] PRIMARY KEY ([AuditLogId]),
        CONSTRAINT [FK_AuditLogs_AppUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [AppUsers] ([UserId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113090811_AppUsersAndAuditLogs'
)
BEGIN
    CREATE UNIQUE INDEX [IX_AppUsers_KeycloakSubject] ON [AppUsers] ([KeycloakSubject]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113090811_AppUsersAndAuditLogs'
)
BEGIN
    CREATE INDEX [IX_AuditLogs_EntityName_EntityId_ActionTime] ON [AuditLogs] ([EntityName], [EntityId], [ActionTime]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113090811_AppUsersAndAuditLogs'
)
BEGIN
    CREATE INDEX [IX_AuditLogs_UserId] ON [AuditLogs] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113090811_AppUsersAndAuditLogs'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261113090811_AppUsersAndAuditLogs', N'10.0.15');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113093119_InvoiceDrafts'
)
BEGIN
    CREATE TABLE [Invoices] (
        [InvoiceId] bigint NOT NULL IDENTITY,
        [InvoiceNumber] nvarchar(30) NULL,
        [CustomerId] bigint NOT NULL,
        [CreatedByUserId] bigint NOT NULL,
        [InvoiceDate] datetime2 NOT NULL,
        [DueDate] date NOT NULL,
        [TotalAmount] decimal(18,2) NOT NULL,
        [IssueStatus] nvarchar(20) NOT NULL,
        [IssuedAt] datetime2 NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_Invoices] PRIMARY KEY ([InvoiceId]),
        CONSTRAINT [CK_Invoices_IssueStatus] CHECK ([IssueStatus] IN ('Draft','Issued','Cancelled')),
        CONSTRAINT [FK_Invoices_AppUsers_CreatedByUserId] FOREIGN KEY ([CreatedByUserId]) REFERENCES [AppUsers] ([UserId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_Invoices_Customers_CustomerId] FOREIGN KEY ([CustomerId]) REFERENCES [Customers] ([CustomerId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113093119_InvoiceDrafts'
)
BEGIN
    CREATE TABLE [InvoiceItems] (
        [InvoiceItemId] bigint NOT NULL IDENTITY,
        [InvoiceId] bigint NOT NULL,
        [Description] nvarchar(500) NOT NULL,
        [Quantity] decimal(18,3) NOT NULL,
        [UnitPrice] decimal(18,2) NOT NULL,
        [LineAmount] decimal(18,2) NOT NULL,
        CONSTRAINT [PK_InvoiceItems] PRIMARY KEY ([InvoiceItemId]),
        CONSTRAINT [FK_InvoiceItems_Invoices_InvoiceId] FOREIGN KEY ([InvoiceId]) REFERENCES [Invoices] ([InvoiceId]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113093119_InvoiceDrafts'
)
BEGIN
    CREATE INDEX [IX_InvoiceItems_InvoiceId] ON [InvoiceItems] ([InvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113093119_InvoiceDrafts'
)
BEGIN
    CREATE INDEX [IX_Invoices_CreatedByUserId] ON [Invoices] ([CreatedByUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113093119_InvoiceDrafts'
)
BEGIN
    CREATE INDEX [IX_Invoices_CustomerId] ON [Invoices] ([CustomerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113093119_InvoiceDrafts'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_Invoices_InvoiceNumber] ON [Invoices] ([InvoiceNumber]) WHERE [InvoiceNumber] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113093119_InvoiceDrafts'
)
BEGIN
    CREATE INDEX [IX_Invoices_IssueStatus_InvoiceDate] ON [Invoices] ([IssueStatus], [InvoiceDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113093119_InvoiceDrafts'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261113093119_InvoiceDrafts', N'10.0.15');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113100720_InvoiceIssueRules'
)
BEGIN
    EXEC(N'ALTER TABLE [Invoices] ADD CONSTRAINT [CK_Invoices_IssueFields] CHECK (([IssueStatus] = ''Issued'' AND [InvoiceNumber] IS NOT NULL AND [IssuedAt] IS NOT NULL AND [TotalAmount] > 0) OR ([IssueStatus] IN (''Draft'',''Cancelled'') AND [InvoiceNumber] IS NULL AND [IssuedAt] IS NULL))');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113100720_InvoiceIssueRules'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261113100720_InvoiceIssueRules', N'10.0.15');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113132644_PaymentsAndAllocations'
)
BEGIN
    CREATE TABLE [Payments] (
        [PaymentId] bigint NOT NULL IDENTITY,
        [PaymentNumber] nvarchar(30) NOT NULL,
        [CustomerId] bigint NOT NULL,
        [ReceivedByUserId] bigint NOT NULL,
        [PaymentDate] date NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [PaymentMethod] nvarchar(30) NOT NULL,
        [ReferenceNumber] nvarchar(100) NULL,
        [Status] nvarchar(20) NOT NULL,
        [ConfirmedAt] datetime2 NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_Payments] PRIMARY KEY ([PaymentId]),
        CONSTRAINT [CK_Payments_Amount] CHECK ([Amount] > 0),
        CONSTRAINT [CK_Payments_Method] CHECK ([PaymentMethod] IN ('Cash','BankTransfer')),
        CONSTRAINT [CK_Payments_Status] CHECK (([Status] = 'Draft' AND [ConfirmedAt] IS NULL) OR ([Status] = 'Confirmed' AND [ConfirmedAt] IS NOT NULL)),
        CONSTRAINT [FK_Payments_AppUsers_ReceivedByUserId] FOREIGN KEY ([ReceivedByUserId]) REFERENCES [AppUsers] ([UserId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_Payments_Customers_CustomerId] FOREIGN KEY ([CustomerId]) REFERENCES [Customers] ([CustomerId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113132644_PaymentsAndAllocations'
)
BEGIN
    CREATE TABLE [PaymentAllocations] (
        [AllocationId] bigint NOT NULL IDENTITY,
        [PaymentId] bigint NOT NULL,
        [InvoiceId] bigint NOT NULL,
        [AllocatedAmount] decimal(18,2) NOT NULL,
        [AllocationDate] datetime2 NOT NULL,
        [CreatedByUserId] bigint NOT NULL,
        CONSTRAINT [PK_PaymentAllocations] PRIMARY KEY ([AllocationId]),
        CONSTRAINT [CK_Allocations_Amount] CHECK ([AllocatedAmount] > 0),
        CONSTRAINT [FK_PaymentAllocations_AppUsers_CreatedByUserId] FOREIGN KEY ([CreatedByUserId]) REFERENCES [AppUsers] ([UserId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PaymentAllocations_Invoices_InvoiceId] FOREIGN KEY ([InvoiceId]) REFERENCES [Invoices] ([InvoiceId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_PaymentAllocations_Payments_PaymentId] FOREIGN KEY ([PaymentId]) REFERENCES [Payments] ([PaymentId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113132644_PaymentsAndAllocations'
)
BEGIN
    CREATE INDEX [IX_PaymentAllocations_CreatedByUserId] ON [PaymentAllocations] ([CreatedByUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113132644_PaymentsAndAllocations'
)
BEGIN
    CREATE INDEX [IX_PaymentAllocations_InvoiceId] ON [PaymentAllocations] ([InvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113132644_PaymentsAndAllocations'
)
BEGIN
    CREATE INDEX [IX_PaymentAllocations_PaymentId] ON [PaymentAllocations] ([PaymentId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113132644_PaymentsAndAllocations'
)
BEGIN
    CREATE INDEX [IX_Payments_CustomerId_Status] ON [Payments] ([CustomerId], [Status]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113132644_PaymentsAndAllocations'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Payments_PaymentNumber] ON [Payments] ([PaymentNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113132644_PaymentsAndAllocations'
)
BEGIN
    CREATE INDEX [IX_Payments_ReceivedByUserId] ON [Payments] ([ReceivedByUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113132644_PaymentsAndAllocations'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261113132644_PaymentsAndAllocations', N'10.0.15');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113134952_DebtReminders'
)
BEGIN
    CREATE TABLE [DebtReminders] (
        [ReminderId] bigint NOT NULL IDENTITY,
        [InvoiceId] bigint NOT NULL,
        [CreatedByUserId] bigint NOT NULL,
        [ReminderDate] datetime2 NOT NULL,
        [ScheduledDate] date NOT NULL,
        [BalanceAtCreation] decimal(18,2) NOT NULL,
        [Content] nvarchar(max) NOT NULL,
        [ContactChannel] nvarchar(20) NOT NULL,
        [ContactInfo] nvarchar(254) NOT NULL,
        [Status] nvarchar(20) NOT NULL,
        [ContactedAt] datetime2 NULL,
        [ContactNote] nvarchar(1000) NULL,
        [ClosedAt] datetime2 NULL,
        [CloseReason] nvarchar(1000) NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_DebtReminders] PRIMARY KEY ([ReminderId]),
        CONSTRAINT [CK_Reminders_Balance] CHECK ([BalanceAtCreation] > 0),
        CONSTRAINT [CK_Reminders_Channel] CHECK ([ContactChannel] IN ('Phone','Email','Other')),
        CONSTRAINT [CK_Reminders_State] CHECK (([Status] = 'Open' AND [ContactedAt] IS NULL AND [ContactNote] IS NULL AND [ClosedAt] IS NULL AND [CloseReason] IS NULL) OR ([Status] = 'Contacted' AND [ContactedAt] IS NOT NULL AND [ContactNote] IS NOT NULL AND [ClosedAt] IS NULL AND [CloseReason] IS NULL) OR ([Status] = 'Closed' AND [ClosedAt] IS NOT NULL AND [CloseReason] IS NOT NULL AND (([ContactedAt] IS NULL AND [ContactNote] IS NULL) OR ([ContactedAt] IS NOT NULL AND [ContactNote] IS NOT NULL)))),
        CONSTRAINT [FK_DebtReminders_AppUsers_CreatedByUserId] FOREIGN KEY ([CreatedByUserId]) REFERENCES [AppUsers] ([UserId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_DebtReminders_Invoices_InvoiceId] FOREIGN KEY ([InvoiceId]) REFERENCES [Invoices] ([InvoiceId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113134952_DebtReminders'
)
BEGIN
    CREATE INDEX [IX_DebtReminders_CreatedByUserId] ON [DebtReminders] ([CreatedByUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113134952_DebtReminders'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_DebtReminders_InvoiceId] ON [DebtReminders] ([InvoiceId]) WHERE [Status] <> ''Closed''');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113134952_DebtReminders'
)
BEGIN
    CREATE INDEX [IX_DebtReminders_Status_ScheduledDate] ON [DebtReminders] ([Status], [ScheduledDate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113134952_DebtReminders'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261113134952_DebtReminders', N'10.0.15');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113142317_DebtAdjustmentsAndJournals'
)
BEGIN
    CREATE TABLE [AccountingAccounts] (
        [AccountId] bigint NOT NULL IDENTITY,
        [AccountCode] nvarchar(30) NOT NULL,
        [AccountName] nvarchar(200) NOT NULL,
        [IsActive] bit NOT NULL,
        [IsReceivable] bit NOT NULL,
        CONSTRAINT [PK_AccountingAccounts] PRIMARY KEY ([AccountId])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113142317_DebtAdjustmentsAndJournals'
)
BEGIN
    CREATE TABLE [DebtAdjustments] (
        [AdjustmentId] bigint NOT NULL IDENTITY,
        [InvoiceId] bigint NOT NULL,
        [CreatedByUserId] bigint NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [AdjustmentDate] date NOT NULL,
        [SignedAmount] decimal(18,2) NOT NULL,
        [Reason] nvarchar(500) NOT NULL,
        [Status] nvarchar(20) NOT NULL,
        [PostedAt] datetime2 NULL,
        [ReversedAt] datetime2 NULL,
        [ReversalReason] nvarchar(500) NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_DebtAdjustments] PRIMARY KEY ([AdjustmentId]),
        CONSTRAINT [CK_Adjustments_Amount] CHECK ([SignedAmount] <> 0),
        CONSTRAINT [CK_Adjustments_State] CHECK (([Status] = 'Draft' AND [PostedAt] IS NULL AND [ReversedAt] IS NULL AND [ReversalReason] IS NULL) OR ([Status] = 'Posted' AND [PostedAt] IS NOT NULL AND [ReversedAt] IS NULL AND [ReversalReason] IS NULL) OR ([Status] = 'Reversed' AND [PostedAt] IS NOT NULL AND [ReversedAt] IS NOT NULL AND [ReversalReason] IS NOT NULL)),
        CONSTRAINT [FK_DebtAdjustments_AppUsers_CreatedByUserId] FOREIGN KEY ([CreatedByUserId]) REFERENCES [AppUsers] ([UserId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_DebtAdjustments_Invoices_InvoiceId] FOREIGN KEY ([InvoiceId]) REFERENCES [Invoices] ([InvoiceId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113142317_DebtAdjustmentsAndJournals'
)
BEGIN
    CREATE TABLE [DebtAdjustmentLines] (
        [DebtAdjustmentLineId] bigint NOT NULL IDENTITY,
        [AdjustmentId] bigint NOT NULL,
        [AccountId] bigint NOT NULL,
        [DebitAmount] decimal(18,2) NOT NULL,
        [CreditAmount] decimal(18,2) NOT NULL,
        CONSTRAINT [PK_DebtAdjustmentLines] PRIMARY KEY ([DebtAdjustmentLineId]),
        CONSTRAINT [CK_AdjustmentLines_Side] CHECK (([DebitAmount] > 0 AND [CreditAmount] = 0) OR ([CreditAmount] > 0 AND [DebitAmount] = 0)),
        CONSTRAINT [FK_DebtAdjustmentLines_AccountingAccounts_AccountId] FOREIGN KEY ([AccountId]) REFERENCES [AccountingAccounts] ([AccountId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_DebtAdjustmentLines_DebtAdjustments_AdjustmentId] FOREIGN KEY ([AdjustmentId]) REFERENCES [DebtAdjustments] ([AdjustmentId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113142317_DebtAdjustmentsAndJournals'
)
BEGIN
    CREATE TABLE [JournalEntries] (
        [JournalEntryId] bigint NOT NULL IDENTITY,
        [AdjustmentId] bigint NOT NULL,
        [EntryDate] date NOT NULL,
        [PostedAt] datetime2 NOT NULL,
        [EntryType] nvarchar(20) NOT NULL,
        [Description] nvarchar(500) NOT NULL,
        [PostedByUserId] bigint NOT NULL,
        CONSTRAINT [PK_JournalEntries] PRIMARY KEY ([JournalEntryId]),
        CONSTRAINT [CK_JournalEntries_Type] CHECK ([EntryType] IN ('Original','Reversal')),
        CONSTRAINT [FK_JournalEntries_AppUsers_PostedByUserId] FOREIGN KEY ([PostedByUserId]) REFERENCES [AppUsers] ([UserId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_JournalEntries_DebtAdjustments_AdjustmentId] FOREIGN KEY ([AdjustmentId]) REFERENCES [DebtAdjustments] ([AdjustmentId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113142317_DebtAdjustmentsAndJournals'
)
BEGIN
    CREATE TABLE [JournalEntryLines] (
        [JournalEntryLineId] bigint NOT NULL IDENTITY,
        [JournalEntryId] bigint NOT NULL,
        [AccountId] bigint NOT NULL,
        [DebitAmount] decimal(18,2) NOT NULL,
        [CreditAmount] decimal(18,2) NOT NULL,
        CONSTRAINT [PK_JournalEntryLines] PRIMARY KEY ([JournalEntryLineId]),
        CONSTRAINT [CK_JournalEntryLines_Side] CHECK (([DebitAmount] > 0 AND [CreditAmount] = 0) OR ([CreditAmount] > 0 AND [DebitAmount] = 0)),
        CONSTRAINT [FK_JournalEntryLines_AccountingAccounts_AccountId] FOREIGN KEY ([AccountId]) REFERENCES [AccountingAccounts] ([AccountId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_JournalEntryLines_JournalEntries_JournalEntryId] FOREIGN KEY ([JournalEntryId]) REFERENCES [JournalEntries] ([JournalEntryId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113142317_DebtAdjustmentsAndJournals'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'AccountId', N'AccountCode', N'AccountName', N'IsActive', N'IsReceivable') AND [object_id] = OBJECT_ID(N'[AccountingAccounts]'))
        SET IDENTITY_INSERT [AccountingAccounts] ON;
    EXEC(N'INSERT INTO [AccountingAccounts] ([AccountId], [AccountCode], [AccountName], [IsActive], [IsReceivable])
    VALUES (CAST(1 AS bigint), N''AR'', N''Phải thu khách hàng (mô phỏng)'', CAST(1 AS bit), CAST(1 AS bit)),
    (CAST(2 AS bigint), N''ADJ'', N''Đối ứng điều chỉnh (mô phỏng)'', CAST(1 AS bit), CAST(0 AS bit)),
    (CAST(3 AS bigint), N''OTHER'', N''Đối ứng khác (mô phỏng)'', CAST(1 AS bit), CAST(0 AS bit))');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'AccountId', N'AccountCode', N'AccountName', N'IsActive', N'IsReceivable') AND [object_id] = OBJECT_ID(N'[AccountingAccounts]'))
        SET IDENTITY_INSERT [AccountingAccounts] OFF;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113142317_DebtAdjustmentsAndJournals'
)
BEGIN
    CREATE UNIQUE INDEX [IX_AccountingAccounts_AccountCode] ON [AccountingAccounts] ([AccountCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113142317_DebtAdjustmentsAndJournals'
)
BEGIN
    CREATE INDEX [IX_DebtAdjustmentLines_AccountId] ON [DebtAdjustmentLines] ([AccountId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113142317_DebtAdjustmentsAndJournals'
)
BEGIN
    CREATE INDEX [IX_DebtAdjustmentLines_AdjustmentId] ON [DebtAdjustmentLines] ([AdjustmentId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113142317_DebtAdjustmentsAndJournals'
)
BEGIN
    CREATE INDEX [IX_DebtAdjustments_CreatedByUserId] ON [DebtAdjustments] ([CreatedByUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113142317_DebtAdjustmentsAndJournals'
)
BEGIN
    CREATE INDEX [IX_DebtAdjustments_InvoiceId] ON [DebtAdjustments] ([InvoiceId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113142317_DebtAdjustmentsAndJournals'
)
BEGIN
    CREATE UNIQUE INDEX [IX_JournalEntries_AdjustmentId_EntryType] ON [JournalEntries] ([AdjustmentId], [EntryType]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113142317_DebtAdjustmentsAndJournals'
)
BEGIN
    CREATE INDEX [IX_JournalEntries_PostedByUserId] ON [JournalEntries] ([PostedByUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113142317_DebtAdjustmentsAndJournals'
)
BEGIN
    CREATE INDEX [IX_JournalEntryLines_AccountId] ON [JournalEntryLines] ([AccountId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113142317_DebtAdjustmentsAndJournals'
)
BEGIN
    CREATE INDEX [IX_JournalEntryLines_JournalEntryId] ON [JournalEntryLines] ([JournalEntryId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113142317_DebtAdjustmentsAndJournals'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261113142317_DebtAdjustmentsAndJournals', N'10.0.15');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113150110_UserAdministration'
)
BEGIN
    ALTER TABLE [AppUsers] ADD [AdminSyncPending] bit NOT NULL DEFAULT CAST(0 AS bit);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113150110_UserAdministration'
)
BEGIN
    ALTER TABLE [AppUsers] ADD [LastAdminUpdate] datetime2 NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113150110_UserAdministration'
)
BEGIN
    ALTER TABLE [AppUsers] ADD [ManagedRolesJson] nvarchar(500) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113150110_UserAdministration'
)
BEGIN
    ALTER TABLE [AppUsers] ADD [ObservedRolesJson] nvarchar(500) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113150110_UserAdministration'
)
BEGIN
    ALTER TABLE [AppUsers] ADD [RowVersion] rowversion NOT NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113150110_UserAdministration'
)
BEGIN
    ALTER TABLE [AppUsers] ADD [Username] nvarchar(150) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113150110_UserAdministration'
)
BEGIN
    CREATE TABLE [UserAdminOperations] (
        [OperationId] bigint NOT NULL IDENTITY,
        [ActorUserId] bigint NOT NULL,
        [TargetUserId] bigint NULL,
        [TargetSubject] nvarchar(64) NULL,
        [TargetUsername] nvarchar(150) NOT NULL,
        [Kind] nvarchar(20) NOT NULL,
        [Status] nvarchar(20) NOT NULL,
        [DesiredJson] nvarchar(max) NOT NULL,
        [LastError] nvarchar(500) NULL,
        [StartedAt] datetime2 NOT NULL,
        [CompletedAt] datetime2 NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_UserAdminOperations] PRIMARY KEY ([OperationId]),
        CONSTRAINT [CK_UserAdminOperations_Kind] CHECK ([Kind] IN ('Create','Update')),
        CONSTRAINT [CK_UserAdminOperations_State] CHECK ([Status] IN ('Pending','Completed','Failed')),
        CONSTRAINT [FK_UserAdminOperations_AppUsers_ActorUserId] FOREIGN KEY ([ActorUserId]) REFERENCES [AppUsers] ([UserId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_UserAdminOperations_AppUsers_TargetUserId] FOREIGN KEY ([TargetUserId]) REFERENCES [AppUsers] ([UserId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113150110_UserAdministration'
)
BEGIN
    CREATE INDEX [IX_UserAdminOperations_ActorUserId] ON [UserAdminOperations] ([ActorUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113150110_UserAdministration'
)
BEGIN
    CREATE INDEX [IX_UserAdminOperations_TargetSubject_StartedAt] ON [UserAdminOperations] ([TargetSubject], [StartedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113150110_UserAdministration'
)
BEGIN
    CREATE INDEX [IX_UserAdminOperations_TargetUserId] ON [UserAdminOperations] ([TargetUserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261113150110_UserAdministration'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261113150110_UserAdministration', N'10.0.15');
END;

COMMIT;
GO

