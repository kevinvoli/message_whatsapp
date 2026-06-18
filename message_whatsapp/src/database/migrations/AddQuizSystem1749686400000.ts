import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class AddQuizSystem1749686400000 implements MigrationInterface {
  name = 'AddQuizSystem1749686400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const categoryExists = await queryRunner.hasTable('quiz_category');
    if (!categoryExists) {
      await queryRunner.createTable(
        new Table({
          name: 'quiz_category',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'name', type: 'varchar', length: '100', isNullable: false },
            { name: 'color', type: 'varchar', length: '7', isNullable: true },
            { name: 'created_at', type: 'datetime', isNullable: false, default: 'CURRENT_TIMESTAMP' },
            { name: 'deleted_at', type: 'datetime', isNullable: true },
          ],
        }),
        true,
      );
    }

    const questionExists = await queryRunner.hasTable('quiz_question');
    if (!questionExists) {
      await queryRunner.createTable(
        new Table({
          name: 'quiz_question',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'category_id', type: 'varchar', length: '36', isNullable: false },
            { name: 'text', type: 'text', isNullable: false },
            { name: 'points', type: 'decimal', precision: 5, scale: 2, default: '1.00' },
            { name: 'time_limit_seconds', type: 'int', isNullable: true },
            { name: 'is_active', type: 'tinyint', width: 1, default: 1 },
            { name: 'created_at', type: 'datetime', isNullable: false, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: 'datetime', isNullable: false, default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
            { name: 'deleted_at', type: 'datetime', isNullable: true },
          ],
        }),
        true,
      );
      await queryRunner.createForeignKey(
        'quiz_question',
        new TableForeignKey({
          columnNames: ['category_id'],
          referencedTableName: 'quiz_category',
          referencedColumnNames: ['id'],
        }),
      );
    }

    const answerExists = await queryRunner.hasTable('quiz_answer');
    if (!answerExists) {
      await queryRunner.createTable(
        new Table({
          name: 'quiz_answer',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'question_id', type: 'varchar', length: '36', isNullable: false },
            { name: 'text', type: 'text', isNullable: false },
            { name: 'is_correct', type: 'tinyint', width: 1, default: 0 },
            { name: 'position', type: 'tinyint', default: 0 },
            { name: 'created_at', type: 'datetime', isNullable: false, default: 'CURRENT_TIMESTAMP' },
          ],
        }),
        true,
      );
      await queryRunner.createForeignKey(
        'quiz_answer',
        new TableForeignKey({
          columnNames: ['question_id'],
          referencedTableName: 'quiz_question',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }

    const sessionExists = await queryRunner.hasTable('quiz_session');
    if (!sessionExists) {
      await queryRunner.createTable(
        new Table({
          name: 'quiz_session',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'title', type: 'varchar', length: '200', isNullable: false },
            { name: 'session_date', type: 'date', isNullable: false, isUnique: true },
            { name: 'is_active', type: 'tinyint', width: 1, default: 1 },
            { name: 'passing_score', type: 'decimal', precision: 5, scale: 2, isNullable: true },
            { name: 'max_attempts', type: 'tinyint', default: 1 },
            { name: 'total_time_minutes', type: 'int', isNullable: true },
            { name: 'created_at', type: 'datetime', isNullable: false, default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: 'datetime', isNullable: false, default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
            { name: 'deleted_at', type: 'datetime', isNullable: true },
          ],
        }),
        true,
      );
    }

    const sessionQuestionExists = await queryRunner.hasTable('quiz_session_question');
    if (!sessionQuestionExists) {
      await queryRunner.createTable(
        new Table({
          name: 'quiz_session_question',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'session_id', type: 'varchar', length: '36', isNullable: false },
            { name: 'question_id', type: 'varchar', length: '36', isNullable: false },
            { name: 'position', type: 'smallint', default: 0 },
          ],
        }),
        true,
      );
      await queryRunner.createIndex(
        'quiz_session_question',
        new TableIndex({
          name: 'UQ_session_question',
          columnNames: ['session_id', 'question_id'],
          isUnique: true,
        }),
      );
      await queryRunner.createForeignKey(
        'quiz_session_question',
        new TableForeignKey({
          columnNames: ['session_id'],
          referencedTableName: 'quiz_session',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
      await queryRunner.createForeignKey(
        'quiz_session_question',
        new TableForeignKey({
          columnNames: ['question_id'],
          referencedTableName: 'quiz_question',
          referencedColumnNames: ['id'],
        }),
      );
    }

    const pdfExists = await queryRunner.hasTable('quiz_pdf');
    if (!pdfExists) {
      await queryRunner.createTable(
        new Table({
          name: 'quiz_pdf',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'session_id', type: 'varchar', length: '36', isNullable: true },
            { name: 'original_name', type: 'varchar', length: '255', isNullable: false },
            { name: 'storage_path', type: 'varchar', length: '500', isNullable: false },
            { name: 'file_size', type: 'int', isNullable: false },
            { name: 'allow_inline_view', type: 'tinyint', width: 1, default: 0 },
            { name: 'is_permanent', type: 'tinyint', width: 1, default: 1 },
            { name: 'available_from', type: 'date', isNullable: true },
            { name: 'available_until', type: 'date', isNullable: true },
            { name: 'uploaded_at', type: 'datetime', isNullable: false },
            { name: 'deleted_at', type: 'datetime', isNullable: true },
          ],
        }),
        true,
      );
      await queryRunner.createForeignKey(
        'quiz_pdf',
        new TableForeignKey({
          columnNames: ['session_id'],
          referencedTableName: 'quiz_session',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
    }

    const exemptionExists = await queryRunner.hasTable('quiz_exemption');
    if (!exemptionExists) {
      await queryRunner.createTable(
        new Table({
          name: 'quiz_exemption',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'scope', type: 'enum', enum: ['commercial', 'poste'], isNullable: false },
            { name: 'commercial_id', type: 'varchar', length: '36', isNullable: true },
            { name: 'poste_id', type: 'varchar', length: '36', isNullable: true },
            { name: 'reason', type: 'varchar', length: '255', isNullable: true },
            { name: 'created_at', type: 'datetime', isNullable: false, default: 'CURRENT_TIMESTAMP' },
            { name: 'deleted_at', type: 'datetime', isNullable: true },
          ],
        }),
        true,
      );
    }

    const attemptExists = await queryRunner.hasTable('quiz_attempt');
    if (!attemptExists) {
      await queryRunner.createTable(
        new Table({
          name: 'quiz_attempt',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'commercial_id', type: 'varchar', length: '36', isNullable: false },
            { name: 'session_id', type: 'varchar', length: '36', isNullable: false },
            { name: 'attempt_number', type: 'tinyint', default: 1 },
            { name: 'question_order', type: 'json', isNullable: false },
            { name: 'started_at', type: 'datetime', isNullable: false },
            { name: 'expires_at', type: 'datetime', isNullable: true },
            { name: 'completed_at', type: 'datetime', isNullable: true },
            { name: 'timed_out', type: 'tinyint', width: 1, default: 0 },
            { name: 'score', type: 'decimal', precision: 5, scale: 2, isNullable: true },
            { name: 'max_score', type: 'decimal', precision: 5, scale: 2, isNullable: true },
            { name: 'is_passed', type: 'tinyint', width: 1, isNullable: true },
          ],
        }),
        true,
      );
      await queryRunner.createIndex(
        'quiz_attempt',
        new TableIndex({
          name: 'IDX_quiz_attempt_commercial_session',
          columnNames: ['commercial_id', 'session_id', 'attempt_number'],
        }),
      );
      await queryRunner.createForeignKey(
        'quiz_attempt',
        new TableForeignKey({
          columnNames: ['session_id'],
          referencedTableName: 'quiz_session',
          referencedColumnNames: ['id'],
        }),
      );
    }

    const answerAttemptExists = await queryRunner.hasTable('quiz_answer_attempt');
    if (!answerAttemptExists) {
      await queryRunner.createTable(
        new Table({
          name: 'quiz_answer_attempt',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'attempt_id', type: 'varchar', length: '36', isNullable: false },
            { name: 'question_id', type: 'varchar', length: '36', isNullable: false },
            { name: 'answer_id', type: 'varchar', length: '36', isNullable: true },
            { name: 'is_correct', type: 'tinyint', width: 1, default: 0 },
            { name: 'points_earned', type: 'decimal', precision: 5, scale: 2, default: '0.00' },
            { name: 'answered_at', type: 'datetime', isNullable: true },
            { name: 'timed_out', type: 'tinyint', width: 1, default: 0 },
          ],
        }),
        true,
      );
      await queryRunner.createIndex(
        'quiz_answer_attempt',
        new TableIndex({
          name: 'UQ_answer_attempt_question',
          columnNames: ['attempt_id', 'question_id'],
          isUnique: true,
        }),
      );
      await queryRunner.createForeignKey(
        'quiz_answer_attempt',
        new TableForeignKey({
          columnNames: ['attempt_id'],
          referencedTableName: 'quiz_attempt',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
      await queryRunner.createForeignKey(
        'quiz_answer_attempt',
        new TableForeignKey({
          columnNames: ['question_id'],
          referencedTableName: 'quiz_question',
          referencedColumnNames: ['id'],
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('quiz_answer_attempt', true);
    await queryRunner.dropTable('quiz_attempt', true);
    await queryRunner.dropTable('quiz_exemption', true);
    await queryRunner.dropTable('quiz_pdf', true);
    await queryRunner.dropTable('quiz_session_question', true);
    await queryRunner.dropTable('quiz_session', true);
    await queryRunner.dropTable('quiz_answer', true);
    await queryRunner.dropTable('quiz_question', true);
    await queryRunner.dropTable('quiz_category', true);
  }
}
