/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class Story1771993803976 {
	name = 'Story1771993803976'

	async up(queryRunner) {
		await queryRunner.query(`
			CREATE TABLE "story" (
				"id" character varying(32) NOT NULL,
				"userId" character varying(32) NOT NULL,
				"text" character varying(500),
				"layer" jsonb,
				"expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
				"viewCount" integer NOT NULL DEFAULT 0,
				CONSTRAINT "PK_story_id" PRIMARY KEY ("id")
			)
		`);
		await queryRunner.query(`CREATE INDEX "IDX_story_userId" ON "story" ("userId")`);
		await queryRunner.query(`CREATE INDEX "IDX_story_expiresAt" ON "story" ("expiresAt")`);
		await queryRunner.query(`ALTER TABLE "story" ADD CONSTRAINT "FK_story_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE`);

		await queryRunner.query(`
			CREATE TABLE "story_view" (
				"id" character varying(32) NOT NULL,
				"storyId" character varying(32) NOT NULL,
				"userId" character varying(32) NOT NULL,
				"viewedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
				CONSTRAINT "PK_story_view_id" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_story_view_storyId_userId" UNIQUE ("storyId", "userId")
			)
		`);
		await queryRunner.query(`CREATE INDEX "IDX_story_view_storyId" ON "story_view" ("storyId")`);
		await queryRunner.query(`CREATE INDEX "IDX_story_view_userId" ON "story_view" ("userId")`);
		await queryRunner.query(`ALTER TABLE "story_view" ADD CONSTRAINT "FK_story_view_storyId" FOREIGN KEY ("storyId") REFERENCES "story"("id") ON DELETE CASCADE`);
		await queryRunner.query(`ALTER TABLE "story_view" ADD CONSTRAINT "FK_story_view_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "story_view" DROP CONSTRAINT "FK_story_view_userId"`);
		await queryRunner.query(`ALTER TABLE "story_view" DROP CONSTRAINT "FK_story_view_storyId"`);
		await queryRunner.query(`DROP INDEX "IDX_story_view_userId"`);
		await queryRunner.query(`DROP INDEX "IDX_story_view_storyId"`);
		await queryRunner.query(`DROP TABLE "story_view"`);

		await queryRunner.query(`ALTER TABLE "story" DROP CONSTRAINT "FK_story_userId"`);
		await queryRunner.query(`DROP INDEX "IDX_story_expiresAt"`);
		await queryRunner.query(`DROP INDEX "IDX_story_userId"`);
		await queryRunner.query(`DROP TABLE "story"`);
	}
}
