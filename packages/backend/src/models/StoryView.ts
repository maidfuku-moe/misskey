/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne, Unique } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiStory } from './Story.js';

@Entity('story_view')
@Unique(['storyId', 'userId'])
export class MiStoryView {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
		comment: 'The story ID.',
	})
	public storyId: MiStory['id'];

	@ManyToOne(type => MiStory, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public story: MiStory | null;

	@Index()
	@Column({
		...id(),
		comment: 'The viewer user ID.',
	})
	public userId: MiUser['id'];

	@ManyToOne(type => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Column('timestamp with time zone')
	public viewedAt: Date;
}
