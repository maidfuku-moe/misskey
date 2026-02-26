<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<button :class="[$style.root, { [$style.unseen]: hasStory && !isAllSeen, [$style.seen]: hasStory && isAllSeen }]" @click="emit('click')">
	<MkAvatar :class="$style.avatar" :user="user" :indicator="false" :link="false"/>
</button>
</template>

<script lang="ts" setup>
import type * as Misskey from 'misskey-js';

const props = defineProps<{
	user: Misskey.entities.UserLite;
	hasStory: boolean;
	isAllSeen: boolean;
}>();

const emit = defineEmits<{
	(event: 'click'): void;
}>();
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	align-items: center;
	align-items: center;
	gap: 4px;
	width: 64px;
	height: 64px;
	padding: 0;
	border: none;
	background: none;
	cursor: pointer;
	border-radius: 12px;
	transition: background 0.15s;

	&:hover {
		background: var(--MI_THEME-hover);
	}
}

.avatar {
	width: 59px;
	height: 59px;
	border-radius: 50%;
	padding: 3px;
	box-sizing: border-box;
}

.avatar div {
	display: flex;
	justify-content: center;
	align-items: center;
}

.avatar img {
	width: calc(100% - 11px);
	height: calc(100% - 11px);
	border-radius: 100%;
	border: 3px solid var(--MI_THEME-panel);
}

.unseen .avatar {
	background: linear-gradient(
		230deg,
		var(--MI_THEME-buttonGradateA) 10%,
		var(--MI_THEME-buttonGradateB) 100%,
	);
}

.seen .avatar {
	background: #d4d4d4;
}

.root:not(.unseen):not(.seen) .avatar {
	background: transparent;
}
</style>
