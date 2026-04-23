import React, { FormEventHandler, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Icon,
  IconButton,
  Icons,
  Input,
  Scroll,
  Spinner,
  Text,
  config,
} from 'folds';
import { useAtom } from 'jotai';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { AISkill, aiSettingsAtom } from '../../../state/ai';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { fetchAihubmixModels, isChatModel } from '../../../utils/ai';

type AIProps = {
  requestClose: () => void;
};

const CN = {
  title: 'AI \u52a9\u624b',
  provider: '\u63a5\u5165\u65b9\u5f0f',
  providerDesc: '\u5f53\u524d\u5148\u652f\u6301 AIHubMix\uff0c\u5efa\u8bae\u7528 OpenAI \u517c\u5bb9\u63a5\u53e3\u6a21\u5f0f\u3002',
  accountSyncHint: '\u4fdd\u5b58\u914d\u7f6e\u3001\u521b\u5efa\u6216\u5220\u9664 Skill \u540e\u4f1a\u81ea\u52a8\u5199\u5165\u5f53\u524d\u8d26\u53f7\u3002',
  apiKey: 'API Key',
  apiBaseUrl: '\u804a\u5929\u63a5\u53e3 Base URL',
  modelsApiUrl: '\u6a21\u578b\u5217\u8868 URL',
  save: '\u4fdd\u5b58',
  fetchModels: '\u62c9\u53d6\u6a21\u578b',
  syncing: '\u62c9\u53d6\u4e2d...',
  createSkill: '\u521b\u5efa Skill',
  skillName: 'Skill \u540d\u79f0',
  skillCommand: '\u659c\u6760\u547d\u4ee4',
  skillModel: '\u4f7f\u7528\u6a21\u578b',
  systemPrompt: '\u7cfb\u7edf\u63d0\u793a\u8bcd',
  noModels: '\u8bf7\u5148\u62c9\u53d6\u6a21\u578b\u5217\u8868',
  noSkills: '\u8fd8\u6ca1\u6709\u521b\u5efa\u4efb\u4f55 Skill',
  currentSkills: '\u5df2\u521b\u5efa Skill',
  roomContext: '\u9ed8\u8ba4\u4f1a\u9644\u5e26\u5f53\u524d\u623f\u95f4\u6700\u8fd1\u804a\u5929\u4e0a\u4e0b\u6587',
  chatOnlyHint:
    'Skill \u521b\u5efa\u5668\u53ea\u4f7f\u7528\u53ef\u804a\u5929\u6a21\u578b\uff0c\u4ee5\u907f\u514d\u8c03\u7528 /chat/completions \u65f6\u62a5\u9519\u3002',
} as const;

const makeSkillId = () => `skill_${Date.now()}`;

const normalizeCommand = (value: string): string => value.trim().replace(/^\//, '').replace(/\s+/g, '');

const buildDefaultCommand = (name: string): string => normalizeCommand(name) || 'assistant';

const removeSkill = (skills: AISkill[], id: string): AISkill[] =>
  skills.filter((skill) => skill.id !== id);

const DEFAULT_BASE_URL = 'https://aihubmix.com/v1';
const DEFAULT_MODELS_API_URL = 'https://aihubmix.com/api/v1/models';

export function AI({ requestClose }: AIProps) {
  const [settings, setSettings] = useAtom(aiSettingsAtom);
  const [skillName, setSkillName] = useState('');
  const [skillCommand, setSkillCommand] = useState('');
  const [skillModel, setSkillModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(
    '\u4f60\u662f\u4e00\u4e2a\u9ad8\u6548\u7684\u4e2d\u6587 Matrix \u6587\u79d8\uff0c\u8981\u5e2e\u7528\u6237\u68b3\u7406\u804a\u5929\u3001\u603b\u7ed3\u91cd\u70b9\u3001\u7edf\u8ba1\u6d3b\u8dc3\u60c5\u51b5\uff0c\u5e76\u7ed9\u51fa\u6e05\u6670\u3001\u53ef\u6267\u884c\u7684\u7ed3\u8bba\u3002'
  );
  const [statusText, setStatusText] = useState<string>();
  const [apiKeyInput, setApiKeyInput] = useState(settings.apiKey);
  const [baseUrlInput, setBaseUrlInput] = useState(settings.baseUrl);
  const [modelsUrlInput, setModelsUrlInput] = useState(settings.modelsApiUrl);

  const [modelsState, loadModels] = useAsyncCallback(
    async (modelsApiUrl: string, apiKey: string) =>
      fetchAihubmixModels(modelsApiUrl, apiKey)
  );

  const chatModels = useMemo(
    () => settings.models.filter(isChatModel).sort((a, b) => a.name.localeCompare(b.name)),
    [settings.models]
  );

  const handleSaveBaseConfig: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const nextApiKey = apiKeyInput.trim();
    const nextBaseUrl = baseUrlInput.trim() || DEFAULT_BASE_URL;
    const nextModelsUrl = modelsUrlInput.trim() || DEFAULT_MODELS_API_URL;

    setSettings({
      ...settings,
      apiKey: nextApiKey,
      baseUrl: nextBaseUrl,
      modelsApiUrl: nextModelsUrl,
    });
    setStatusText('\u57fa\u7840 AI \u914d\u7f6e\u5df2\u4fdd\u5b58');
  };

  const handleFetchModels = () => {
    const nextApiKey = apiKeyInput.trim();
    const nextBaseUrl = baseUrlInput.trim() || DEFAULT_BASE_URL;
    const nextModelsUrl = modelsUrlInput.trim() || DEFAULT_MODELS_API_URL;

    loadModels(nextModelsUrl, nextApiKey)
      .then((models) => {
        const firstChatModel = models.find(isChatModel);

        setSettings({
          ...settings,
          apiKey: nextApiKey,
          baseUrl: nextBaseUrl,
          modelsApiUrl: nextModelsUrl,
          models,
        });
        if (!skillModel && firstChatModel) {
          setSkillModel(firstChatModel.id);
        }
        setStatusText(
          models.length > 0
            ? `\u5df2\u540c\u6b65 ${models.length} \u4e2a\u6a21\u578b\uff0c\u5176\u4e2d ${models.filter(isChatModel).length} \u4e2a\u53ef\u7528\u4e8e Skill`
            : '\u63a5\u53e3\u8fd4\u56de 0 \u4e2a\u6a21\u578b\uff0c\u8bf7\u68c0\u67e5 URL \u6216 API Key \u662f\u5426\u6b63\u786e'
        );
      })
      .catch((error) => {
        setStatusText(
          error instanceof Error ? error.message : '\u62c9\u53d6\u6a21\u578b\u5931\u8d25\u3002'
        );
      });
  };

  const handleCreateSkill: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const name = skillName.trim();
    const command = normalizeCommand(skillCommand || buildDefaultCommand(name));
    const model = skillModel || chatModels[0]?.id;
    const prompt = systemPrompt.trim();

    if (!name || !command || !model || !prompt) return;

    const nextSkill: AISkill = {
      id: makeSkillId(),
      name,
      command,
      model,
      systemPrompt: prompt,
      includeRoomContext: true,
      maxEvents: 40,
    };

    setSettings({
      ...settings,
      skills: settings.skills.concat(nextSkill),
    });
    setSkillName('');
    setSkillCommand('');
    setStatusText(`Skill /${command} \u5df2\u521b\u5efa`);
  };

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              {CN.title}
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <Box direction="Column" gap="100">
                <Text size="L400">{CN.provider}</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <Text size="T300" priority="300">
                    {CN.providerDesc}
                  </Text>
                  <Text size="T300" priority="300">
                    {CN.accountSyncHint}
                  </Text>
                  <Box as="form" direction="Column" gap="300" onSubmit={handleSaveBaseConfig}>
                    <Input
                      name="apiKey"
                      value={apiKeyInput}
                      onChange={(evt) => setApiKeyInput(evt.currentTarget.value)}
                      placeholder={CN.apiKey}
                      variant="Background"
                      outlined
                    />
                    <Input
                      name="baseUrl"
                      value={baseUrlInput}
                      onChange={(evt) => setBaseUrlInput(evt.currentTarget.value)}
                      placeholder={CN.apiBaseUrl}
                      variant="Background"
                      outlined
                    />
                    <Input
                      name="modelsUrl"
                      value={modelsUrlInput}
                      onChange={(evt) => setModelsUrlInput(evt.currentTarget.value)}
                      placeholder={CN.modelsApiUrl}
                      variant="Background"
                      outlined
                    />
                    <Box gap="200">
                      <Button type="submit" variant="Primary" size="300" radii="300">
                        <Text size="B300">{CN.save}</Text>
                      </Button>
                      <Button
                        type="button"
                        variant="Secondary"
                        fill="Soft"
                        size="300"
                        radii="300"
                        onClick={handleFetchModels}
                        before={
                          modelsState.status === AsyncStatus.Loading ? (
                            <Spinner size="100" variant="Secondary" fill="Solid" />
                          ) : undefined
                        }
                      >
                        <Text size="B300">
                          {modelsState.status === AsyncStatus.Loading
                            ? CN.syncing
                            : CN.fetchModels}
                        </Text>
                      </Button>
                    </Box>
                    {statusText && (
                      <Text size="T300" priority="300">
                        {statusText}
                      </Text>
                    )}
                  </Box>
                </SequenceCard>
              </Box>

              <Box direction="Column" gap="100">
                <Text size="L400">{CN.createSkill}</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <Box as="form" direction="Column" gap="300" onSubmit={handleCreateSkill}>
                    <Text size="T300" priority="300">
                      {CN.chatOnlyHint}
                    </Text>
                    <Input
                      value={skillName}
                      onChange={(evt) => setSkillName(evt.currentTarget.value)}
                      placeholder={CN.skillName}
                      variant="Background"
                      outlined
                    />
                    <Input
                      value={skillCommand}
                      onChange={(evt) => setSkillCommand(evt.currentTarget.value)}
                      placeholder={CN.skillCommand}
                      variant="Background"
                      outlined
                    />
                    <Box direction="Column" gap="100">
                      <Text size="T300" priority="300">
                        {CN.skillModel}
                      </Text>
                      <select
                        value={skillModel}
                        onChange={(evt) => setSkillModel(evt.currentTarget.value)}
                        style={{
                          minHeight: 40,
                          borderRadius: 12,
                          border: '1px solid rgba(0, 0, 0, 0.15)',
                          padding: `0 ${config.space.S300}`,
                        }}
                      >
                        <option value="">{chatModels[0] ? '\u8bf7\u9009\u62e9' : CN.noModels}</option>
                        {chatModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                    </Box>
                    <Box direction="Column" gap="100">
                      <Text size="T300" priority="300">
                        {CN.systemPrompt}
                      </Text>
                      <textarea
                        value={systemPrompt}
                        onChange={(evt) => setSystemPrompt(evt.currentTarget.value)}
                        rows={6}
                        style={{
                          resize: 'vertical',
                          borderRadius: 12,
                          border: '1px solid rgba(0, 0, 0, 0.15)',
                          padding: config.space.S300,
                          fontFamily: 'inherit',
                        }}
                      />
                    </Box>
                    <Text size="T300" priority="300">
                      {CN.roomContext}
                    </Text>
                    <Button
                      type="submit"
                      variant="Primary"
                      size="300"
                      radii="300"
                      disabled={!chatModels.length}
                      aria-disabled={!chatModels.length}
                    >
                      <Text size="B300">{CN.createSkill}</Text>
                    </Button>
                  </Box>
                </SequenceCard>
              </Box>

              <Box direction="Column" gap="100">
                <Text size="L400">{CN.currentSkills}</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  {settings.skills.length === 0 && (
                    <Text size="T300" priority="300">
                      {CN.noSkills}
                    </Text>
                  )}
                  {settings.skills.map((skill) => (
                    <SettingTile
                      key={skill.id}
                      title={`${skill.name}  /${skill.command}`}
                      description={`${skill.model}\n${skill.systemPrompt}`}
                      after={
                        <Button
                          variant="Critical"
                          fill="Soft"
                          size="300"
                          radii="300"
                          onClick={() =>
                            setSettings({
                              ...settings,
                              skills: removeSkill(settings.skills, skill.id),
                            })
                          }
                        >
                          <Text size="B300">{'\u5220\u9664'}</Text>
                        </Button>
                      }
                    />
                  ))}
                </SequenceCard>
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
