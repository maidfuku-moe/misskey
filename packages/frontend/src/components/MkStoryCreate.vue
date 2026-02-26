<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="modal"
	:width="420"
	:height="816"
	:withOkButton="false"
	@close="cancel"
	@closed="emit('closed')"
	@esc="cancel"
>
	<template #header>{{ i18n.ts._story.create }}</template>

	<div :class="$style.root">
		<MkStoryEditor
			ref="editorRef"
			@update:layers="onLayersUpdate"
		/>

		<div :class="$style.footer">
			<MkButton gradate full :disabled="submitting || (!hasImage && !hasText)" @click="submit">
				<MkLoading v-if="submitting" :em="true"/>
				<template v-else><i class="ti ti-send"/> {{ i18n.ts._story.post }}</template>
			</MkButton>
		</div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import type { Layer } from '@/components/MkStoryEditor.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkStoryEditor from '@/components/MkStoryEditor.vue';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const emit = defineEmits<{
	(event: 'created', story: unknown): void;
	(event: 'closed'): void;
}>();

const modal = ref<InstanceType<typeof MkModalWindow> | null>(null);
const editorRef = ref<InstanceType<typeof MkStoryEditor> | null>(null);
const submitting = ref(false);
const layers = ref<Layer[]>([]);
const hasText = ref(false);
const hasImage = ref(false);

function onLayersUpdate(newLayers: Layer[]) {
	layers.value = newLayers;
	hasText.value = newLayers.some(l => l.type === 'text' && 'text' in l && l.text.trim());
	hasImage.value = newLayers.some(l => l.type === 'image');
}

async function submit() {
	if (submitting.value) return;
	submitting.value = true;
	try {
		const layer = editorRef.value?.getLayerConfig() ?? null;
		const story = await misskeyApi('stories/create', {
			text: null,
			layer,
		});
		emit('created', story);
		modal.value?.close();
	} finally {
		submitting.value = false;
	}
}

function cancel() {
	modal.value?.close();
}
</script>

<style lang="scss" module>
.root {
	padding: 16px;
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.footer {
	margin-top: 4px;
}
</style>
