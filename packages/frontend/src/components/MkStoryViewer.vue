<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" @click.self="closeViewer" @keydown.esc="closeViewer">
	<Transition
		:enterActiveClass="$style.transition_viewer_enterActive"
		:enterFromClass="$style.transition_viewer_enterFrom"
		appear
	>
		<div :class="$style.viewer" @click.stop>
			<!-- 상단 진행 바 -->
			<div :class="$style.progressBars">
				<div
					v-for="(story, idx) in currentGroupStories"
					:key="story.id"
					:class="$style.progressTrack"
				>
					<div
						:class="$style.progressFill"
						:style="{
							width: idx < currentIndex ? '100%' : idx === currentIndex ? `${progress}%` : '0%',
							transition: idx === currentIndex ? `width ${progressDuration}ms linear` : 'none',
						}"
					/>
				</div>
			</div>

			<!-- 유저 정보 -->
			<div :class="$style.header">
				<MkAvatar :class="$style.headerAvatar" :user="currentStory.user" :link="false" :indicator="false"/>
				<div :class="$style.headerInfo">
					<span :class="$style.headerName">{{ currentStory.user.username }}</span>
					<MkTime :time="currentStory.createdAt" :class="$style.headerTime"/>
				</div>
				<div :class="$style.headerRight">
					<button v-if="isOwnStory" class="_button" :class="$style.viewCount" @click="openViewers">
						<i class="ti ti-eye"/> {{ currentStory.viewCount }}
					</button>
					<button class="_button" :class="$style.closeButton" @click="closeViewer">
						<i class="ti ti-x"/>
					</button>
				</div>
			</div>

			<!-- 미디어 -->
			<div ref="mediaAreaEl" :class="$style.mediaArea" @click="onAreaClick">
				<template v-if="currentImageLayer">
					<video
						v-if="currentFileType === 'video'"
						ref="videoEl"
						:class="$style.media"
						:src="currentImageLayer.url"
						autoplay
						playsinline
						muted
						@ended="advance"
						@loadedmetadata="onVideoLoaded"
					/>
					<img v-else :src="currentImageLayer.url" :alt="currentImageLayer.name" :style="viewerImageStyle"/>
				</template>
				<div v-else :class="$style.textOnlyBg"/>

				<!-- 오버레이 이미지 (이모지 등) -->
				<img
					v-for="layer in currentOverlayImageLayers"
					:key="layer.id"
					:class="$style.overlayImage"
					:src="layer.url"
					:style="overlayImageOverlayStyle(layer)"
				/>

				<!-- 텍스트 오버레이 -->
				<template v-if="currentTextLayers.length > 0">
					<div
						v-for="layer in currentTextLayers"
						:key="layer.id"
						:class="$style.textOverlay"
						:style="textOverlayStyle(layer)"
					>
						{{ layer.text }}
					</div>
				</template>

				<!-- 좌/우 클릭 영역 -->
				<div :class="$style.tapLeft" @click.stop="prev"/>
				<div :class="$style.tapRight" @click.stop="advance"/>
			</div>

			<!-- 하단: 본인 스토리는 삭제 버튼, 타인 스토리는 반응 UI -->
			<div :class="$style.footer">
				<template v-if="isOwnStory">
					<button class="_button" :class="$style.deleteButton" @click="deleteStory">
						<i class="ti ti-trash"/> {{ i18n.ts.delete }}
					</button>
				</template>
				<template v-else>
					<div :class="$style.replyArea">
						<button ref="emojiButtonEl" class="_button" :class="$style.emojiButton" @click="openEmojiPicker">
							<i class="ti ti-mood-smile"/>
						</button>
						<input
							v-model="replyText"
							:class="$style.replyInput"
							:placeholder="i18n.ts._story.replyPlaceholder"
							@focus="pauseProgress"
							@blur="resumeProgress"
							@keydown.enter.prevent="sendReply"
						/>
						<button class="_button" :class="$style.sendButton" :disabled="!replyText.trim()" @click="sendReply">
							<i class="ti ti-send"/>
						</button>
					</div>
				</template>
			</div>

			<!-- 뷰어 목록 패널 -->
			<div v-if="showViewers" :class="$style.viewersPanel">
				<div :class="$style.viewersPanelHeader">
					<span>{{ i18n.ts._story.viewers }}</span>
					<button class="_button" @click="closeViewers"><i class="ti ti-x"/></button>
				</div>
				<div :class="$style.viewersList">
					<div v-for="v in viewersList" :key="v.userId" :class="$style.viewerItem">
						<MkAvatar :user="v.user" :link="false" :class="$style.viewerAvatar"/>
						<span>{{ v.user.username }}</span>
					</div>
					<div v-if="viewersList.length === 0" :class="$style.noViewers">
						{{ i18n.ts._story.noViewers }}
					</div>
				</div>
			</div>
		</div>
	</Transition>
</div>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onBeforeUnmount, useTemplateRef, nextTick, defineAsyncComponent } from 'vue';
import * as Misskey from 'misskey-js';
import type { SavedTextLayer, SavedImageLayer } from '@/components/MkStoryEditor.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const IMAGE_DURATION = 5000; // 이미지 자동 진행: 5초

const props = defineProps<{
	storyGroups: Array<{ stories: Misskey.entities.Story[] }>;
	startGroupIndex?: number;
	initialIndex?: number;
}>();

const emit = defineEmits<{
	(event: 'viewed', storyId: string): void;
	(event: 'deleted', storyId: string): void;
	(event: 'closed'): void;
}>();

const currentGroupIndex = ref(props.startGroupIndex ?? 0);
const currentIndex = ref(props.initialIndex ?? 0);
const progress = ref(0);
const progressDuration = ref(IMAGE_DURATION);
const replyText = ref('');
const videoEl = useTemplateRef<HTMLVideoElement>('videoEl');
const emojiButtonEl = useTemplateRef<HTMLButtonElement>('emojiButtonEl');
const mediaAreaEl = useTemplateRef<HTMLElement>('mediaAreaEl');
const showViewers = ref(false);
const viewersList = ref<Array<{ userId: string; user: Misskey.entities.UserLite; viewedAt: string }>>([]);

let timer: number | null = null;
let startTime = 0;
let paused = false;
let currentDuration = 0;
let remainingTime = 0;

const currentGroupStories = computed(() => props.storyGroups[currentGroupIndex.value]?.stories ?? []);
const currentStory = computed(() => currentGroupStories.value[currentIndex.value]);
const isOwnStory = computed(() => currentStory.value.userId === $i?.id);

type LayerConfig = {
	layers: Array<{ type: string;[key: string]: unknown }>;
	canvasWidth: number;
	canvasHeight: number;
};

const currentLayerConfig = computed(() =>
	currentStory.value?.layer as LayerConfig | null ?? null,
);

// 배경 이미지 (fileId가 있는 드라이브 파일)
const currentImageLayer = computed(() =>
	currentLayerConfig.value?.layers.find(l => l.type === 'image' && (l as SavedImageLayer).fileId !== '') as SavedImageLayer | undefined ?? null,
);

// 오버레이 이미지 레이어들 (이모지 등, fileId === '')
const currentOverlayImageLayers = computed(() =>
	(currentLayerConfig.value?.layers.filter(l => l.type === 'image' && (l as SavedImageLayer).fileId === '') ?? []) as SavedImageLayer[],
);

const currentTextLayers = computed(() =>
	(currentLayerConfig.value?.layers.filter(l => l.type === 'text') ?? []) as SavedTextLayer[],
);

const currentFileType = computed(() =>
	currentImageLayer.value?.fileType ?? null,
);

const viewerImageStyle = computed(() => {
	const il = currentImageLayer.value;
	if (!il) return {};
	const config = currentLayerConfig.value;
	if (!config) return {};
	// Saved x,y are ratios (0-1) of canvas size → convert to px-based transform
	const x = il.x * config.canvasWidth;
	const y = il.y * config.canvasHeight;
	return {
		position: 'absolute' as const,
		inset: '0',
		transformOrigin: 'center center',
		transform: `translate(${x}px, ${y}px) scale(${il.scale}) rotate(${il.rotation}deg)`,
	};
});

function overlayImageOverlayStyle(layer: SavedImageLayer) {
	const config = currentLayerConfig.value;
	if (!config) return {};
	const x = layer.x * config.canvasWidth;
	const y = layer.y * config.canvasHeight;
	return {
		left: '0',
		top: '0',
		width: '96px',
		height: '96px',
		objectFit: 'contain' as const,
		transform: `translate(${x}px, ${y}px) rotate(${layer.rotation ?? 0}deg) scale(${layer.scale ?? 1})`,
		transformOrigin: 'center center',
	};
}

function layerBg(layer: SavedTextLayer): string {
	if (layer.bgStyle === 'translucent') return 'rgba(0,0,0,0.45)';
	if (layer.bgStyle === 'opaque') return '#000000';
	return 'transparent';
}

function textOverlayStyle(layer: SavedTextLayer) {
	return {
		left: `${layer.x * 100}%`,
		top: `${layer.y * 100}%`,
		fontSize: `${layer.fontSize}px`,
		color: layer.color,
		background: layerBg(layer),
		transform: `translate(-50%, -50%) scale(${layer.scale ?? 1}) rotate(${layer.rotation ?? 0}deg)`,
	};
}

function pauseProgress() {
	if (paused || currentDuration === 0) return;
	paused = true;
	const elapsed = Date.now() - startTime;
	remainingTime = currentDuration - elapsed;
	const pct = Math.min((elapsed / currentDuration) * 100, 100);
	if (timer) { window.clearTimeout(timer); timer = null; }
	progressDuration.value = 0;
	nextTick(() => { progress.value = pct; });
	videoEl.value?.pause();
}

function resumeProgress() {
	if (!paused) return;
	paused = false;
	startTime = Date.now();
	progressDuration.value = remainingTime;
	nextTick(() => { progress.value = 100; });
	timer = window.setTimeout(advance, remainingTime);
	videoEl.value?.play();
}

function startProgress(duration: number) {
	if (timer) window.clearTimeout(timer);
	paused = false;
	currentDuration = duration;
	remainingTime = duration;
	progress.value = 0;
	progressDuration.value = duration;
	startTime = Date.now();
	requestAnimationFrame(() => {
		progress.value = 100;
	});
	timer = window.setTimeout(advance, duration);
}

function advance() {
	if (currentIndex.value < currentGroupStories.value.length - 1) {
		currentIndex.value++;
	} else if (currentGroupIndex.value < props.storyGroups.length - 1) {
		currentGroupIndex.value++;
		currentIndex.value = 0;
	} else {
		closeViewer();
	}
}

function prev() {
	if (currentIndex.value > 0) {
		currentIndex.value--;
	} else if (currentGroupIndex.value > 0) {
		currentGroupIndex.value--;
		currentIndex.value = props.storyGroups[currentGroupIndex.value].stories.length - 1;
	}
}

function onAreaClick(event: MouseEvent) {
	// 좌우 탭 영역은 각자 핸들링하므로 여기서는 아무것도 하지 않음
}

function onVideoLoaded() {
	if (!videoEl.value) return;
	const duration = videoEl.value.duration * 1000;
	startProgress(duration);
}

function closeViewer() {
	if (timer) window.clearTimeout(timer);
	emit('closed');
}

async function recordView() {
	if (!$i || isOwnStory.value) return;
	await misskeyApi('stories/view', { storyId: currentStory.value.id }).catch(() => {});
	emit('viewed', currentStory.value.id);
}

async function deleteStory() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.deleteConfirm,
	});
	if (canceled) return;
	await misskeyApi('stories/delete', { storyId: currentStory.value.id });
	emit('deleted', currentStory.value.id);
	closeViewer();
}

function openEmojiPicker() {
	if (!emojiButtonEl.value) return;
	pauseProgress();
	const anchorElement = ref(emojiButtonEl.value);
	os.popup(defineAsyncComponent(() => import('@/components/MkEmojiPickerDialog.vue')), {
		anchorElement,
		asReactionPicker: false,
		choseAndClose: true,
	}, {
		done: (emoji: string) => {
			misskeyApi('chat/messages/create-to-user', {
				toUserId: currentStory.value.userId,
				text: emoji,
			})
				.then(() => os.toast(i18n.ts._story.messageSent))
				.catch(() => {});
		},
		closed: () => resumeProgress(),
	});
}

async function sendReply() {
	const text = replyText.value.trim();
	if (!text) return;
	replyText.value = '';
	await misskeyApi('chat/messages/create-to-user', {
		toUserId: currentStory.value.userId,
		text,
	}).catch(() => {});
	os.toast(i18n.ts._story.messageSent);
}

async function openViewers() {
	pauseProgress();
	viewersList.value = await misskeyApi('stories/viewers', { storyId: currentStory.value.id });
	showViewers.value = true;
}

function closeViewers() {
	showViewers.value = false;
	// resumeProgress();
}

watch([currentGroupIndex, currentIndex], () => {
	if (timer) window.clearTimeout(timer);
	paused = false;
	currentDuration = 0;
	progress.value = 0;
	recordView();

	const isVideo = currentFileType.value === 'video';
	if (!isVideo) {
		startProgress(IMAGE_DURATION);
	}
	// 영상인 경우 onVideoLoaded에서 처리
}, { immediate: true });

onBeforeUnmount(() => {
	if (timer) window.clearTimeout(timer);
});
</script>

<style lang="scss" module>
.root {
	position: fixed;
	inset: 0;
	z-index: 9999;
	background: rgba(0, 0, 0, 0.85);
	display: flex;
	align-items: center;
	justify-content: center;
}

.transition_viewer_enterActive {
	transition: opacity 0.2s, transform 0.2s !important;
}

.transition_viewer_enterFrom {
	opacity: 0;
	transform: scale(0.9);
}

.viewer {
	position: relative;
	width: min(100vw, 400px);
	height: min(100vh, 711px);
	background: #000;
	border-radius: 12px;
	overflow: hidden;
	display: flex;
	flex-direction: column;
}

.progressBars {
	display: flex;
	gap: 4px;
	padding: 8px 8px 0;
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	z-index: 10;
}

.progressTrack {
	flex: 1;
	height: 3px;
	background: rgba(255, 255, 255, 0.3);
	border-radius: 2px;
	overflow: hidden;
}

.progressFill {
	height: 100%;
	background: #fff;
	border-radius: 2px;
	width: 0%;
}

.header {
	position: absolute;
	top: 16px;
	left: 0;
	right: 0;
	z-index: 10;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 0 12px;
}

.headerAvatar {
	width: 36px;
	height: 36px;
	border-radius: 50%;
	border: 2px solid rgba(255, 255, 255, 0.6);
}

.headerInfo {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 1px;
}

.headerName {
	font-size: 13px;
	font-weight: 700;
	color: #fff;
	text-shadow: 0 1px 3px rgba(0,0,0,0.6);
}

.headerTime {
	font-size: 11px;
	color: rgba(255, 255, 255, 0.75);
}

.headerRight {
	display: flex;
	align-items: center;
	gap: 8px;
}

.viewCount {
	font-size: 12px;
	color: rgba(255, 255, 255, 0.85);
}

.closeButton {
	color: #fff;
	font-size: 20px;
	padding: 4px;
}

.mediaArea {
	flex: 1;
	position: relative;
	overflow: hidden;
}

.textOnlyBg {
	width: 100%;
	height: 100%;
	background: linear-gradient(135deg, #1a1a2e, #16213e, #0f3460);
}

.overlayImage {
	position: absolute;
	user-select: none;
	pointer-events: none;
}

.textOverlay {
	position: absolute;
	padding: 4px 8px;
	border-radius: 4px;
	user-select: none;
	pointer-events: none;
	white-space: pre-wrap;
	width: max-content;
}

.tapLeft {
	position: absolute;
	left: 0;
	top: 0;
	width: 35%;
	height: 100%;
	cursor: pointer;
}

.tapRight {
	position: absolute;
	right: 0;
	top: 0;
	width: 35%;
	height: 100%;
	cursor: pointer;
}

.footer {
	padding: 12px;
	background: linear-gradient(transparent, rgba(0,0,0,0.6));
}

.deleteButton {
	width: 100%;
	padding: 10px;
	border-radius: 8px;
	background: rgba(255, 80, 80, 0.85);
	color: #fff;
	font-size: 14px;
}

.replyArea {
	display: flex;
	gap: 8px;
	align-items: center;
}

.emojiButton {
	color: #fff;
	font-size: 22px;
	padding: 4px;
	flex-shrink: 0;
}

.replyInput {
	flex: 1;
	padding: 8px 12px;
	border-radius: 20px;
	border: 1px solid rgba(255, 255, 255, 0.4);
	background: rgba(255, 255, 255, 0.15);
	color: #fff;
	font-size: 14px;
	font-family: inherit;
	outline: none;

	&::placeholder {
		color: rgba(255, 255, 255, 0.5);
	}
}

.sendButton {
	color: #fff;
	font-size: 20px;
	padding: 4px;
	flex-shrink: 0;

	&:disabled {
		opacity: 0.4;
	}
}

.viewersPanel {
	position: absolute;
	inset: 0;
	background: rgba(0, 0, 0, 0.92);
	z-index: 30;
	display: flex;
	flex-direction: column;
}

.viewersPanelHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 16px;
	color: #fff;
	font-size: 16px;
	font-weight: 700;
	border-bottom: 1px solid rgba(255, 255, 255, 0.15);

	button {
		color: #fff;
		font-size: 20px;
	}
}

.viewersList {
	flex: 1;
	overflow-y: auto;
	padding: 8px 0;
}

.viewerItem {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 16px;
	color: #fff;
	font-size: 14px;
}

.viewerAvatar {
	width: 36px;
	height: 36px;
	border-radius: 50%;
	flex-shrink: 0;
}

.noViewers {
	padding: 24px 16px;
	color: rgba(255, 255, 255, 0.5);
	text-align: center;
	font-size: 14px;
}
</style>
