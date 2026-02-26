<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div ref="canvasRef" :class="$style.canvas" @click.self="deselectLayer">
		<!-- 상태 1: 미디어 없음 -->
		<div v-if="!selectedFile" :class="$style.emptyState">
			<button ref="addMediaButton" class="_button" :class="$style.addMediaButton" @click="pickMedia">
				<i class="ti ti-photo-plus" style="font-size: 24px;"/>
				<span>{{ i18n.ts._story.addMedia }}</span>
			</button>
		</div>

		<template v-else>
			<!-- 상태 2a: 비디오 -->
			<video
				v-if="fileType === 'video'"
				:class="$style.media"
				:src="selectedFile.url"
				loop
				muted
				autoplay
				playsinline
			/>

			<!-- 상태 2b: 이미지 + moveable -->
			<template v-else>
				<img
					ref="imageRef"
					:class="$style.storyImage"
					:src="selectedFile.url"
					:alt="selectedFile.name"
					:style="imageStyle"
					@click.self="deselectLayer"
				/>

				<!-- 텍스트 레이어들: transform-only 포지셔닝 -->
				<template v-for="layer in textLayers" :key="layer.id">
					<div
						v-if="editingLayerId !== layer.id"
						:ref="(el) => setLayerRef(layer.id, el as HTMLElement | null)"
						:class="[$style.textLayer, { [$style.textLayerSelected]: selectedLayerId === layer.id }]"
						:style="textLayerStyle(layer)"
						@click.stop="selectLayer(layer.id)"
						@dblclick.stop="startEditLayer(layer.id)"
					>
						{{ layer.text }}
					</div>
					<!-- 더블클릭 인라인 편집 -->
					<span
						v-else
						:ref="(el) => setLayerRef(layer.id, el as HTMLElement | null)"
						:class="$style.inlineEditArea"
						:style="textLayerStyle(layer)"
						contenteditable
						@input="(e) => updateLayerText(layer.id, (e.target as HTMLSpanElement).innerText)"
						@click.stop
						@blur="finishEditLayer"
						@keydown.esc="finishEditLayer"
					/>
				</template>

				<!-- 오버레이 이미지 레이어들 (이모지 등) -->
				<img
					v-for="layer in overlayImageLayers"
					:key="layer.id"
					:ref="(el) => setLayerRef(layer.id, el as HTMLElement | null)"
					:class="[$style.overlayImage, { [$style.overlayImageSelected]: selectedLayerId === layer.id }]"
					:src="layer.url"
					:style="overlayImageStyle(layer)"
					@click.stop="selectLayer(layer.id)"
				/>

				<!-- Moveable: 이미지·텍스트 모두 scalable 활성화 -->
				<Moveable
					v-if="deferredMoveableTarget"
					:target="deferredMoveableTarget"
					:draggable="true"
					:scalable="true"
					:rotatable="true"
					:origin="false"
					:throttleDrag="0"
					:throttleRotate="0"
					:keepRatio="true"
					@drag="onDrag"
					@dragEnd="onDragEnd"
					@scale="onScale"
					@scaleEnd="onScaleEnd"
					@rotate="onRotate"
					@rotateEnd="onRotateEnd"
				/>
			</template>

			<!-- 미디어 교체 버튼 (우하단) -->
			<button ref="replaceMediaButton" class="_button" :class="$style.replaceMediaButton" @click="pickMedia">
				<i class="ti ti-refresh"/>
			</button>
		</template>

		<!-- 하단 플로팅 툴바 (이미지 선택 시, 편집 모드 아닐 때) -->
		<div v-if="fileType === 'image' && !editingLayerId" :class="$style.floatingToolbar">
			<button class="_button" :class="$style.aaButton" @click="addTextLayer">Aa</button>
			<button class="_button" :class="$style.aaButton" @click="addEmoji">
				<i class="ti ti-mood-smile"/>
			</button>
			<template v-if="selectedLayerId">
				<!-- 텍스트 레이어 전용 도구: 컬러, 배경 -->
				<template v-if="selectedLayer">
					<input
						type="color"
						:class="$style.colorPicker"
						:value="selectedLayer.color"
						@input="(e) => updateSelectedLayerProp('color', (e.target as HTMLInputElement).value)"
					/>
					<button
						v-for="bg in bgStyles"
						:key="bg.value"
						:class="[$style.bgButton, { [$style.bgButtonActive]: selectedLayer.bgStyle === bg.value }]"
						@click="updateSelectedLayerProp('bgStyle', bg.value)"
					>
						{{ bg.label }}
					</button>
				</template>
				<!-- 삭제: 모든 레이어 공통 -->
				<button class="_button" :class="$style.deleteLayerButton" @click="removeSelectedLayer">
					<i class="ti ti-trash"/>
				</button>
			</template>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, shallowRef, computed, watch, nextTick, reactive, defineAsyncComponent } from 'vue';
import Moveable from 'vue3-moveable';
import { i18n } from '@/i18n.js';
import { selectFile } from '@/utility/drive.js';
import { customEmojisMap } from '@/custom-emojis.js';
import { popup } from '@/os.js';

// ── 편집 중 내부 상태 (px / transform 기반) ────────────────────────────
export type TextLayer = {
	id: string;
	type: 'text';
	text: string;
	// Moveable이 관리하는 transform 값 (px 기반)
	translateX: number;
	translateY: number;
	rotation: number;
	scale: number;
	// 외형
	fontSize: number; // 기본 폰트 크기 (px)
	color: string;
	bgStyle: 'none' | 'translucent' | 'opaque';
};

export type ImageLayer = {
	id: string;
	type: 'image';
	fileId: string;
	url: string;
	name: string;
	fileType: 'image' | 'video';
	// Moveable transform (px)
	translateX: number;
	translateY: number;
	rotation: number;
	scale: number;
};

export type Layer = TextLayer | ImageLayer;

// ── 저장용 포맷 (% 기반) ─────────────────────────────────────────────
export type SavedTextLayer = {
	id: string;
	type: 'text';
	text: string;
	x: number; // 0–1 (캔버스 너비 대비 비율)
	y: number; // 0–1 (캔버스 높이 대비 비율)
	rotation: number;
	scale: number;
	fontSize: number;
	color: string;
	bgStyle: 'none' | 'translucent' | 'opaque';
};

export type SavedImageLayer = {
	id: string;
	type: 'image';
	fileId: string;
	url: string;
	name: string;
	fileType: 'image' | 'video';
	x: number;
	y: number;
	rotation: number;
	scale: number;
};

type LayerConfig = {
	layers: (SavedTextLayer | SavedImageLayer)[];
	canvasWidth: number;
	canvasHeight: number;
};

const emit = defineEmits<{
	(event: 'update:layers', layers: Layer[]): void;
}>();

// ── state ──────────────────────────────────────────────────────────────
const layers = ref<Layer[]>([]);
const selectedLayerId = ref<string | null>(null);
const editingLayerId = ref<string | null>(null);

const canvasRef = ref<HTMLElement | null>(null);
const imageRef = ref<HTMLImageElement | null>(null);
const addMediaButton = ref<HTMLElement | null>(null);
const replaceMediaButton = ref<HTMLElement | null>(null);
const layerRefs = reactive<Record<string, HTMLElement | null>>({});

function setLayerRef(id: string, el: HTMLElement | null) {
	layerRefs[id] = el;
}

// ── computed ───────────────────────────────────────────────────────────
// 배경 이미지 (fileId가 있는 드라이브 파일)
const imageLayer = computed(() =>
	layers.value.find((l): l is ImageLayer => l.type === 'image' && l.fileId !== '') ?? null,
);

// 오버레이 이미지 레이어들 (이모지 등, fileId === '')
const overlayImageLayers = computed(() =>
	layers.value.filter((l): l is ImageLayer => l.type === 'image' && l.fileId === ''),
);

const selectedFile = computed(() => {
	const il = imageLayer.value;
	if (!il) return null;
	return { url: il.url, name: il.name, fileType: il.fileType };
});

const fileType = computed(() => {
	return imageLayer.value?.fileType ?? null;
});

const textLayers = computed(() => layers.value.filter((l): l is TextLayer => l.type === 'text'));

const selectedLayer = computed(() =>
	textLayers.value.find(l => l.id === selectedLayerId.value) ?? null,
);

const moveableTarget = computed<HTMLElement | null>(() => {
	// 인라인 편집 중에는 Moveable 숨김
	if (editingLayerId.value) return null;

	if (selectedLayerId.value && layerRefs[selectedLayerId.value]) {
		return layerRefs[selectedLayerId.value] ?? null;
	}
	if (fileType.value === 'image' && imageRef.value) {
		return imageRef.value;
	}
	return null;
});

// Moveable에 넘기는 실제 target — DOM 교체(v-if 전환)가 완료된 뒤에만 설정
const deferredMoveableTarget = shallowRef<HTMLElement | null>(null);
watch(moveableTarget, (val) => {
	if (val == null) {
		deferredMoveableTarget.value = null;
	} else {
		nextTick(() => {
			deferredMoveableTarget.value = moveableTarget.value;
		});
	}
});

const imageStyle = computed(() => {
	const il = imageLayer.value;
	if (!il) return {};
	return {
		transform: `translate(${il.translateX}px, ${il.translateY}px) scale(${il.scale}) rotate(${il.rotation}deg)`,
	};
});

const bgStyles = [
	{ value: 'none' as const, label: 'None' },
	{ value: 'translucent' as const, label: 'Tint' },
	{ value: 'opaque' as const, label: 'Solid' },
];

// ── helpers ────────────────────────────────────────────────────────────
function layerBg(layer: TextLayer): string {
	if (layer.bgStyle === 'translucent') return 'rgba(0,0,0,0.45)';
	if (layer.bgStyle === 'opaque') return '#000000';
	return 'transparent';
}

function setInnerTextForSpan(el: HTMLSpanElement, text: string) {
	el.innerText = text;
	// 커서 위치 맨 뒤로
	const range = window.document.createRange();
	range.selectNodeContents(el);
	range.collapse(false);
	const sel = window.getSelection();
	sel?.removeAllRanges();
	sel?.addRange(range);
}

/**
 * 텍스트 레이어 스타일 — left/top 사용 금지!
 * Moveable이 transform을 직접 제어하므로 transform-only 포지셔닝.
 */
function textLayerStyle(layer: TextLayer) {
	const style: Record<string, string> = {
		fontSize: `${layer.fontSize}px`,
		color: layer.color,
		background: layerBg(layer),
	};

	style.transform = `translate(${layer.translateX}px, ${layer.translateY}px) rotate(${layer.rotation}deg) scale(${layer.scale})`;

	return style;
}

function overlayImageStyle(layer: ImageLayer) {
	return {
		transform: `translate(${layer.translateX}px, ${layer.translateY}px) rotate(${layer.rotation}deg) scale(${layer.scale})`,
	};
}

function parseTransform(el: HTMLElement) {
	const m = new DOMMatrix(getComputedStyle(el).transform);
	const scale = Math.sqrt(m.a * m.a + m.b * m.b);
	const rotation = Math.atan2(m.b, m.a) * (180 / Math.PI);
	return { x: m.m41, y: m.m42, scale, rotation };
}

// ── media ──────────────────────────────────────────────────────────────
async function pickMedia() {
	const file = await selectFile({ anchorElement: addMediaButton.value ?? replaceMediaButton.value, multiple: false });
	if (file) {
		const isVideo = file.type.startsWith('video/');

		const canvasRect = canvasRef.value?.getBoundingClientRect();
		const { width, height } = file.properties;
		const x = canvasRect && width ? (canvasRect.width / 2) - (width / 2) : 0;
		const y = canvasRect && height ? (canvasRect.height / 2) - (height / 2) : 0;
		const scale = canvasRect && width && height
			? Math.min(canvasRect.width / width, canvasRect.height / height)
			: 1;

		const newImageLayer: ImageLayer = {
			id: `image-${Date.now()}`,
			type: 'image',
			fileId: file.id,
			url: file.url,
			name: file.name,
			fileType: isVideo ? 'video' : 'image',
			translateX: x,
			translateY: y,
			rotation: 0,
			scale,
		};

		// 기존 이미지 레이어 교체, 텍스트 레이어는 유지하지 않음 (새 미디어 선택 시 초기화)
		layers.value = [newImageLayer];
		selectedLayerId.value = null;
		emit('update:layers', layers.value);
	}
}

// ── layer management ───────────────────────────────────────────────────
function selectLayer(id: string) {
	selectedLayerId.value = id;
}

function deselectLayer() {
	selectedLayerId.value = null;
}

function addTextLayer() {
	const canvasEl = canvasRef.value;
	const cw = canvasEl?.offsetWidth ?? 400;
	const ch = canvasEl?.offsetHeight ?? 700;

	const layer: TextLayer = {
		id: `text-${Date.now()}`,
		type: 'text',
		text: 'Text',
		translateX: cw / 2,
		translateY: ch / 2,
		rotation: 0,
		scale: 1,
		fontSize: 24,
		color: '#ffffff',
		bgStyle: 'translucent',
	};
	// editingLayerId를 먼저 설정하여 Moveable target이 null을 유지하도록 함
	// (target이 잡혔다가 바로 사라지는 타이밍 이슈 방지)
	editingLayerId.value = layer.id;
	layers.value.push(layer);
	selectedLayerId.value = layer.id;
	emit('update:layers', layers.value);

	// 렌더 후 요소 크기를 측정해서 정확히 중앙 정렬 + 인라인 편집 시작
	nextTick(() => {
		const el = layerRefs[layer.id] as HTMLSpanElement | null;
		if (el) {
			// span(inlineEditArea)이므로 크기 측정 후 중앙 정렬
			layer.translateX -= el.offsetWidth / 2;
			layer.translateY -= el.offsetHeight / 2;
			el.focus();
			setInnerTextForSpan(el, layer.text);
		}
	});
}

function addEmoji(ev: MouseEvent) {
	const anchorElement = ref(ev.currentTarget as HTMLElement);

	popup(defineAsyncComponent(() => import('@/components/MkEmojiPickerDialog.vue')), {
		anchorElement,
		asReactionPicker: false,
		choseAndClose: true,
	}, {
		done: (emoji: string) => {
			const canvasEl = canvasRef.value;
			const cw = canvasEl?.offsetWidth ?? 400;
			const ch = canvasEl?.offsetHeight ?? 700;

			if (emoji.startsWith(':')) {
				// 커스텀 이모지 → ImageLayer
				const name = emoji.slice(1, -1);
				const emojiData = customEmojisMap.get(name);
				if (!emojiData) return;

				const layer: ImageLayer = {
					id: `image-${Date.now()}`,
					type: 'image',
					fileId: '',
					url: emojiData.url,
					name: `:${name}:`,
					fileType: 'image',
					translateX: cw / 2 - 48,
					translateY: ch / 2 - 48,
					rotation: 0,
					scale: 1,
				};
				layers.value.push(layer);
				selectedLayerId.value = layer.id;
			} else {
				// 유니코드 이모지 → TextLayer
				const layer: TextLayer = {
					id: `text-${Date.now()}`,
					type: 'text',
					text: emoji,
					translateX: cw / 2,
					translateY: ch / 2,
					rotation: 0,
					scale: 1,
					fontSize: 48,
					color: '#ffffff',
					bgStyle: 'none',
				};
				layers.value.push(layer);
				selectedLayerId.value = layer.id;

				nextTick(() => {
					const el = layerRefs[layer.id];
					if (el) {
						layer.translateX -= el.offsetWidth / 2;
						layer.translateY -= el.offsetHeight / 2;
					}
				});
			}

			emit('update:layers', layers.value);
		},
	});
}

function startEditLayer(id: string) {
	editingLayerId.value = id;
	nextTick(() => {
		const el = layerRefs[id] as HTMLSpanElement | null;
		const layer = layers.value.find(l => l.id === id) as TextLayer | undefined;
		if (el && layer) {
			el.focus();
			setInnerTextForSpan(el, layer.text);
		}
	});
}

function finishEditLayer() {
	editingLayerId.value = null;
}

function updateLayerText(id: string, text: string) {
	const layer = layers.value.find(l => l.id === id) as TextLayer | undefined;
	if (layer) layer.text = text;
}

function removeSelectedLayer() {
	if (!selectedLayerId.value) return;
	delete layerRefs[selectedLayerId.value];
	layers.value = layers.value.filter(l => l.id !== selectedLayerId.value);
	selectedLayerId.value = null;
	emit('update:layers', layers.value);
}

function updateSelectedLayerProp<K extends keyof TextLayer>(key: K, value: TextLayer[K]) {
	const layer = layers.value.find(l => l.id === selectedLayerId.value) as TextLayer | undefined;
	if (layer) {
		(layer as TextLayer)[key] = value;
		emit('update:layers', layers.value);
	}
}

// ── Moveable: transform 파싱 → 레이어/이미지 상태로 동기화 ─────────────
function syncTransformToState(target: HTMLElement) {
	const parsed = parseTransform(target);

	if (selectedLayerId.value) {
		const layer = layers.value.find(l => l.id === selectedLayerId.value);
		if (!layer) return;
		layer.translateX = parsed.x;
		layer.translateY = parsed.y;
		layer.rotation = parsed.rotation;
		layer.scale = parsed.scale;
		emit('update:layers', layers.value);
	} else {
		// Image layer (selected via imageRef, no selectedLayerId)
		const il = imageLayer.value;
		if (il) {
			il.translateX = parsed.x;
			il.translateY = parsed.y;
			il.rotation = parsed.rotation;
			il.scale = parsed.scale;
			emit('update:layers', layers.value);
		}
	}
}

// ── moveable event handlers ────────────────────────────────────────────
function onDrag({ target, transform }: { target: HTMLElement; transform: string }) {
	target.style.transform = transform;
}

function onScale({ target, transform }: { target: HTMLElement; transform: string }) {
	target.style.transform = transform;
}

function onRotate({ target, transform }: { target: HTMLElement; transform: string }) {
	target.style.transform = transform;
}

// 완료: DOM transform → reactive 상태로 동기화
function onDragEnd({ target, isDrag }: { target: HTMLElement; isDrag: boolean }) {
	if (!isDrag) return;
	syncTransformToState(target);
}

function onScaleEnd({ target }: { target: HTMLElement }) {
	syncTransformToState(target);
}

function onRotateEnd({ target }: { target: HTMLElement }) {
	syncTransformToState(target);
}

// ── expose: 저장 시 px → % 변환 ──────────────────────────────────────
defineExpose({
	getLayerConfig(): LayerConfig | null {
		const canvasEl = canvasRef.value;
		if (!canvasEl) return null;
		const cw = canvasEl.offsetWidth;
		const ch = canvasEl.offsetHeight;

		if (layers.value.length === 0) return null;

		// 편집 중 px → 저장용 % 변환
		const savedLayers: (SavedTextLayer | SavedImageLayer)[] = layers.value.map((layer) => {
			if (layer.type === 'image') {
				return {
					id: layer.id,
					type: layer.type,
					fileId: layer.fileId,
					url: layer.url,
					name: layer.name,
					fileType: layer.fileType,
					x: layer.translateX / cw,
					y: layer.translateY / ch,
					rotation: layer.rotation,
					scale: layer.scale,
				};
			}

			// text layer
			const el = layerRefs[layer.id];
			const elW = el?.offsetWidth ?? 0;
			const elH = el?.offsetHeight ?? 0;

			// 레이어 중심점 기준 % 계산
			// translateX/Y는 요소 좌상단 기준이므로 중심으로 보정
			const centerX = layer.translateX + (elW / 2);
			const centerY = layer.translateY + (elH / 2);

			return {
				id: layer.id,
				type: layer.type,
				text: layer.text,
				x: centerX / cw, // 0~1 비율
				y: centerY / ch, // 0~1 비율
				rotation: layer.rotation,
				scale: layer.scale,
				fontSize: layer.fontSize,
				color: layer.color,
				bgStyle: layer.bgStyle,
			};
		});

		return {
			layers: savedLayers,
			canvasWidth: cw,
			canvasHeight: ch,
		};
	},
});
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
}

.canvas {
	position: relative;
	width: 100%;
	aspect-ratio: 9 / 16;
	background: #1a1a1a;
	border-radius: 12px;
	overflow: clip;
	cursor: default;
}

.emptyState {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
}

.addMediaButton {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	padding: 24px 32px;
	border-radius: 16px;
	border: 2px dashed rgba(255, 255, 255, 0.3);
	color: rgba(255, 255, 255, 0.6);
	font-size: 14px;
	transition: border-color 0.2s, color 0.2s;

	&:hover {
		border-color: rgba(255, 255, 255, 0.7);
		color: rgba(255, 255, 255, 0.9);
	}
}

.media {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.storyImage {
	position: absolute;
	inset: 0;
	transform-origin: center center;
}

/* ★ 핵심 변경: left/top 제거, transform-only 포지셔닝 */
.textLayer {
	position: absolute;
	left: 0;
	top: 0;
	padding: 4px 8px;
	border-radius: 4px;
	cursor: move;
	user-select: none;
	white-space: pre-wrap;
	max-width: 80%;
	word-break: break-word;
	border: 2px solid transparent;
	font-weight: bold;
	text-align: center;
	/* Moveable이 transform-origin을 기준으로 scale/rotate 처리 */
	transform-origin: center center;
}

.textLayerSelected {
	border-color: rgba(255, 255, 255, 0.8);
}

.overlayImage {
	position: absolute;
	left: 0;
	top: 0;
	width: 96px;
	height: 96px;
	object-fit: contain;
	cursor: move;
	user-select: none;
	border: 2px solid transparent;
	transform-origin: center center;
}

.overlayImageSelected {
	border-color: rgba(255, 255, 255, 0.8);
}

.inlineEditArea {
	padding: 4px 8px;
	border-radius: 4px;
	min-width: 16px;
	min-height: 16px;
	background: rgba(0, 0, 0, 0.4);
	border: 2px solid var(--MI_THEME-accent);
	color: inherit;
	font-size: inherit;
	font-family: inherit;
	font-weight: bold;
	text-align: center;
	resize: none;
	outline: none;
	transform-origin: center center;
	display: inline-block;
}

.replaceMediaButton {
	position: absolute;
	bottom: 60px;
	right: 12px;
	width: 36px;
	height: 36px;
	border-radius: 50%;
	background: rgba(0, 0, 0, 0.55);
	color: #fff;
	font-size: 16px;
	display: flex;
	align-items: center;
	justify-content: center;
	border: 1px solid rgba(255, 255, 255, 0.3);
	z-index: 5;
}

.floatingToolbar {
	position: absolute;
	bottom: 12px;
	left: 0;
	right: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 0 12px;
	z-index: 5;
}

.aaButton {
	padding: 6px 14px;
	border-radius: 20px;
	background: rgba(0, 0, 0, 0.55);
	color: #fff;
	font-size: 15px;
	font-weight: bold;
	border: 1px solid rgba(255, 255, 255, 0.4);
	flex-shrink: 0;
}

.colorPicker {
	width: 26px;
	height: 22px;
	border: none;
	cursor: pointer;
	border-radius: 4px;
	flex-shrink: 0;
	padding: 0;
}

.bgButton {
	padding: 3px 7px;
	border-radius: 4px;
	border: 1px solid rgba(255, 255, 255, 0.3);
	background: rgba(255, 255, 255, 0.1);
	color: #fff;
	font-size: 10px;
	cursor: pointer;
	flex-shrink: 0;
}

.bgButtonActive {
	background: var(--MI_THEME-accent);
	border-color: var(--MI_THEME-accent);
}

.deleteLayerButton {
	padding: 6px 10px;
	border-radius: 20px;
	background: rgba(255, 80, 80, 0.7);
	color: #fff;
	font-size: 14px;
	border: none;
	flex-shrink: 0;
}
</style>
