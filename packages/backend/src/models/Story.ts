/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('story')
export class MiStory {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
		comment: 'The owner ID.',
	})
	public userId: MiUser['id'];

	@ManyToOne(type => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Column('varchar', {
		length: 500,
		nullable: true,
	})
	public text: string | null;

	@Column('jsonb', {
		nullable: true,
		comment: 'Layer configuration (images, text overlays, etc.)',
	})
	public layer: Record<string, unknown> | null;

	@Index()
	@Column('timestamp with time zone', {
		comment: 'When this story expires (24h after creation).',
	})
	public expiresAt: Date;

	@Column('integer', {
		default: 0,
	})
	public viewCount: number;
}
