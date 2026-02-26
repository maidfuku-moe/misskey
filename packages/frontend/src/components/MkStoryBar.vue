<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div ref="scrollEl" :class="$style.scroll">
		<!-- 내 스토리 or 추가 버튼 -->
		<div v-if="$i" :class="$style.item">
			<div :class="$style.ringWrapper">
				<MkStoryRing
					:user="$i"
					:hasStory="true"
					:isAllSeen="myStories.every(s => s.isViewed)"
					@click="openMyStory"
				/>
				<button :class="$style.addIcon" @click="openCreate"><i class="ti ti-plus"></i></button>
			</div>
			<p :class="$style.username">{{ $i.username }}</p>
		</div>

		<!-- 팔로잉 스토리 -->
		<div
			v-for="group in storyGroups"
			:key="group.userId"
			:class="$style.item"
		>
			<MkStoryRing
				:user="group.user"
				:hasStory="true"
				:isAllSeen="group.stories.every(s => s.isViewed)"
				@click="openViewer(group)"
			/>
			<span :class="$style.username">{{ group.user.username }}</span>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, onBeforeUnmount, defineAsyncComponent } from 'vue';
import * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useStream } from '@/stream.js';
import { $i } from '@/i.js';
import * as os from '@/os.js';
import MkStoryRing from '@/components/MkStoryRing.vue';

type StoryGroup = {
	userId: string;
	user: Misskey.entities.UserLite;
	stories: Misskey.entities.Story[];
};

const stories = ref<Misskey.entities.Story[]>([]);
const scrollEl = ref<HTMLElement | null>(null);

const myStories = computed(() =>
	stories.value.filter(s => s.userId === $i?.id),
);

const storyGroups = computed<StoryGroup[]>(() => {
	const map = new Map<string, StoryGroup>();
	for (const story of stories.value) {
		if (story.userId === $i?.id) continue;
		if (!map.has(story.userId)) {
			map.set(story.userId, { userId: story.userId, user: story.user, stories: [] });
		}
		map.get(story.userId)!.stories.push(story);
	}
	return Array.from(map.values());
});

const allStoryGroups = computed(() => {
	const groups: Array<{ stories: Misskey.entities.Story[] }> = [];
	if (myStories.value.length > 0) groups.push({ stories: myStories.value });
	storyGroups.value.forEach(g => groups.push({ stories: g.stories }));
	return groups;
});

async function fetchStories() {
	const res = await misskeyApi('stories/list', {});
	stories.value = res;
}

function openCreate() {
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkStoryCreate.vue')), {}, {
		created: (story: Misskey.entities.Story) => {
			if (!stories.value.some(s => s.id === story.id)) {
				stories.value.unshift(story);
			}
		},
		closed: () => dispose(),
	});
}

function openMyStory() {
	if (myStories.value.length === 0) {
		openCreate();
		return;
	}
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkStoryViewer.vue')), {
		storyGroups: allStoryGroups.value,
		startGroupIndex: 0,
		initialIndex: 0,
	}, {
		deleted: (storyId: string) => {
			stories.value = stories.value.filter(s => s.id !== storyId);
		},
		viewed: (storyId: string) => {
			const story = stories.value.find(s => s.id === storyId);
			if (story) story.isViewed = true;
		},
		closed: () => dispose(),
	});
}

function openViewer(group: StoryGroup) {
	const groupIndex = allStoryGroups.value.findIndex(g => g.stories === group.stories || g.stories[0]?.userId === group.userId);
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkStoryViewer.vue')), {
		storyGroups: allStoryGroups.value,
		startGroupIndex: groupIndex >= 0 ? groupIndex : 0,
		initialIndex: 0,
	}, {
		viewed: (storyId: string) => {
			const story = stories.value.find(s => s.id === storyId);
			if (story) story.isViewed = true;
		},
		closed: () => dispose(),
	});
}

const stream = useStream();
const connection = stream.useChannel('main');

onMounted(() => {
	fetchStories();
	connection.on('storyCreated', (story) => {
		if (!stories.value.some(s => s.id === story.id)) {
			stories.value.unshift(story);
		}
	});
});

onBeforeUnmount(() => {
	connection.dispose();
});
</script>

<style lang="scss" module>
.root {
	padding: 12px 0;
	border-bottom: 1px solid var(--MI_THEME-divider);
}

.scroll {
	display: flex;
	flex-direction: row;
	gap: 12px;
	overflow-x: auto;
	padding: 0 12px;
	scrollbar-width: none;

	&::-webkit-scrollbar {
		display: none;
	}
}

.item {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	flex-shrink: 0;
}

.username {
	font-size: 12px;
	max-width: 60px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	text-align: center;
	color: var(--MI_THEME-fg);
	margin: 0;
}

.ringWrapper {
	position: relative;
}

.addIcon {
	position: absolute;
	bottom: 5px;
	right: 5px;
	width: 20px;
	height: 20px;
	background: black;
	border-radius: 50%;
	border: 2px solid white;
	display: flex;
	align-items: center;
	justify-content: center;
	color: white;
	font-size: 8px;
	z-index: 1;
	cursor: pointer;
}
</style>
