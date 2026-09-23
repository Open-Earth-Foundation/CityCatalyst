"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  HStack,
  Icon,
  Image,
  Input,
  NativeSelect,
  SimpleGrid,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { LuCircleCheck, LuPlus, LuSend, LuX } from "react-icons/lu";
import { HeadlineSmall } from "@/components/package/Texts/Headline";
import {
  BodyLarge,
  BodyMedium,
  BodySmall,
} from "@/components/package/Texts/Body";
import { LabelLarge, LabelMedium } from "@/components/package/Texts/Label";
import { TitleLarge } from "@/components/package/Texts/Title";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import { useDemoT } from "../_lib/useDemoT";
import { SCREEN_IDS } from "../_lib/hrefs";
import { ScreenTag } from "../_components/ScreenTag";

const QUESTION_KEYS = [
  "fb-q-1",
  "fb-q-2",
  "fb-q-3",
  "fb-q-4",
  "fb-q-5",
  "fb-q-7",
  "fb-q-8",
  "fb-q-9",
  "fb-q-10",
  "fb-q-11",
];
const CATEGORIES = ["bug", "copy", "design", "concept", "question"];
const PRIORITIES = ["blocker", "important", "nice"];
const SCREEN_OPTIONS = [
  "General",
  SCREEN_IDS.guide,
  ...Object.values(SCREEN_IDS.adaptation),
  ...Object.values(SCREEN_IDS.mitigation),
];
const STORAGE_KEY = "hiap-br-demo:reviewer";
const MAX_SHOTS = 6;

interface Remark {
  screenId: string;
  section: string;
  category: string;
  priority: string;
  comment: string;
  suggestion: string;
  files: File[];
}

const emptyRemark = (): Remark => ({
  screenId: "General",
  section: "",
  category: "design",
  priority: "important",
  comment: "",
  suggestion: "",
  files: [],
});

/**
 * BR-FB — the reviewer feedback form: who you are, the guide's questions,
 * and as many remarks as you like, each with screenshots. Posts one
 * multipart submission to the demo's feedback endpoint.
 */
export default function FeedbackPage(props: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = React.use(props.params);
  const { t } = useDemoT(lng);
  const [name, setName] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<Remark[]>([emptyRemark()]);
  const [status, setStatus] = useState<
    "idle" | "sending" | "sent" | "error" | "nothing"
  >("idle");

  // Restore the reviewer's name after mount (deferred, so the server and
  // first client render agree on empty fields).
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
        if (saved.name) setName(saved.name);
        if (saved.organisation) setOrganisation(saved.organisation);
      } catch {
        // No saved reviewer: fields start empty.
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const shotCount = useMemo(
    () => remarks.reduce((n, r) => n + r.files.length, 0),
    [remarks],
  );

  const updateRemark = (i: number, patch: Partial<Remark>) =>
    setRemarks((prev) =>
      prev.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    );
  const addFiles = (i: number, incoming: FileList | File[]) => {
    const images = Array.from(incoming).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (images.length === 0) return;
    setRemarks((prev) =>
      prev.map((r, j) =>
        j === i
          ? { ...r, files: [...r.files, ...images].slice(0, MAX_SHOTS) }
          : r,
      ),
    );
  };

  const submit = async () => {
    const hasAnswers = Object.values(answers).some((v) => v.trim());
    const filled = remarks.filter(
      (r) => r.comment.trim() || r.suggestion.trim(),
    );
    if (!hasAnswers && filled.length === 0) {
      setStatus("nothing");
      return;
    }
    setStatus("sending");
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, organisation }));
    } catch {
      // Storage blocked: the reviewer just types their name again next time.
    }
    const form = new FormData();
    form.set(
      "payload",
      JSON.stringify({
        reviewerName: name,
        organisation,
        lang: lng,
        answers,
        comments: remarks.map(({ files: _files, ...rest }) => rest),
      }),
    );
    remarks.forEach((r, i) =>
      r.files.forEach((f, n) => form.append(`shot-${i}-${n}`, f, f.name)),
    );
    try {
      const res = await fetch("/api/v1/hiap-demo/feedback", {
        method: "POST",
        body: form,
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  };

  const reset = () => {
    setAnswers({});
    setRemarks([emptyRemark()]);
    setStatus("idle");
  };

  return (
    <Box
      mx="auto"
      w="full"
      maxW="1090px"
      px="l"
      pt="xxl"
      pb="xxl-6"
      display="flex"
      flexDirection="column"
      gap="xl"
    >
      <HStack justifyContent="space-between" alignItems="flex-start" gap="m">
        <VStack alignItems="stretch" gap="m" maxW="720px">
          <HeadlineSmall color="content.primary">{t("fb-title")}</HeadlineSmall>
          <BodyLarge color="content.secondary">{t("fb-intro")}</BodyLarge>
        </VStack>
        <ScreenTag id="BR-FB" title={t("screen-tag-title")} />
      </HStack>

      {status === "sent" ? (
        <Card.Root borderColor="interactive.tertiary">
          <Card.Body p="l">
            <VStack alignItems="flex-start" gap="m">
              <HStack gap="s">
                <Icon
                  as={LuCircleCheck}
                  boxSize="22px"
                  color="interactive.tertiary"
                />
                <TitleLarge color="content.primary">
                  {t("fb-success-title")}
                </TitleLarge>
              </HStack>
              <BodyMedium color="content.secondary">
                {t("fb-success-body")}
              </BodyMedium>
              <MeedButton variant="outlined" minW="auto" px="l" onClick={reset}>
                {t("fb-send-more")}
              </MeedButton>
            </VStack>
          </Card.Body>
        </Card.Root>
      ) : (
        <>
          <Card.Root borderColor="border.overlay">
            <Card.Body p="l">
              <VStack alignItems="stretch" gap="m">
                <TitleLarge color="content.primary">
                  {t("fb-about-title")}
                </TitleLarge>
                <SimpleGrid columns={{ base: 1, md: 2 }} gap="m">
                  <VStack alignItems="stretch" gap="xs">
                    <LabelMedium color="content.secondary">
                      {t("fb-name")}
                    </LabelMedium>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={120}
                    />
                  </VStack>
                  <VStack alignItems="stretch" gap="xs">
                    <LabelMedium color="content.secondary">
                      {t("fb-organisation")}
                    </LabelMedium>
                    <Input
                      value={organisation}
                      onChange={(e) => setOrganisation(e.target.value)}
                      maxLength={120}
                    />
                  </VStack>
                </SimpleGrid>
              </VStack>
            </Card.Body>
          </Card.Root>

          <Card.Root borderColor="border.overlay">
            <Card.Body p="l">
              <VStack alignItems="stretch" gap="l">
                <VStack alignItems="stretch" gap="s">
                  <TitleLarge color="content.primary">
                    {t("fb-questions-title")}
                  </TitleLarge>
                  <BodyMedium color="content.secondary">
                    {t("fb-questions-intro")}
                  </BodyMedium>
                </VStack>
                {QUESTION_KEYS.map((key, i) => (
                  <VStack key={key} alignItems="stretch" gap="s">
                    <LabelLarge color="content.primary">
                      {i + 1}. {t(key)}
                    </LabelLarge>
                    <Textarea
                      rows={3}
                      value={answers[key] ?? ""}
                      onChange={(e) =>
                        setAnswers((a) => ({ ...a, [key]: e.target.value }))
                      }
                      maxLength={5000}
                    />
                  </VStack>
                ))}
              </VStack>
            </Card.Body>
          </Card.Root>

          <VStack alignItems="stretch" gap="l">
            <VStack alignItems="stretch" gap="s">
              <TitleLarge color="content.primary">
                {t("fb-comments-title")}
              </TitleLarge>
              <BodyMedium color="content.secondary">
                {t("fb-comments-intro")}
              </BodyMedium>
            </VStack>
            {remarks.map((r, i) => (
              <Card.Root key={i} borderColor="border.overlay">
                <Card.Body p="l">
                  <VStack alignItems="stretch" gap="m">
                    <SimpleGrid columns={{ base: 1, md: 4 }} gap="m">
                      <VStack alignItems="stretch" gap="xs">
                        <LabelMedium color="content.secondary">
                          {t("fb-screen")}
                        </LabelMedium>
                        <NativeSelect.Root>
                          <NativeSelect.Field
                            value={r.screenId}
                            onChange={(e) =>
                              updateRemark(i, { screenId: e.target.value })
                            }
                          >
                            {SCREEN_OPTIONS.map((id) => (
                              <option key={id} value={id}>
                                {id === "General" ? t("fb-screen-general") : id}
                              </option>
                            ))}
                          </NativeSelect.Field>
                          <NativeSelect.Indicator />
                        </NativeSelect.Root>
                      </VStack>
                      <VStack alignItems="stretch" gap="xs">
                        <LabelMedium color="content.secondary">
                          {t("fb-category")}
                        </LabelMedium>
                        <NativeSelect.Root>
                          <NativeSelect.Field
                            value={r.category}
                            onChange={(e) =>
                              updateRemark(i, { category: e.target.value })
                            }
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {t(`fb-cat-${c}`)}
                              </option>
                            ))}
                          </NativeSelect.Field>
                          <NativeSelect.Indicator />
                        </NativeSelect.Root>
                      </VStack>
                      <VStack alignItems="stretch" gap="xs">
                        <LabelMedium color="content.secondary">
                          {t("fb-priority")}
                        </LabelMedium>
                        <NativeSelect.Root>
                          <NativeSelect.Field
                            value={r.priority}
                            onChange={(e) =>
                              updateRemark(i, { priority: e.target.value })
                            }
                          >
                            {PRIORITIES.map((p) => (
                              <option key={p} value={p}>
                                {t(`fb-pri-${p}`)}
                              </option>
                            ))}
                          </NativeSelect.Field>
                          <NativeSelect.Indicator />
                        </NativeSelect.Root>
                      </VStack>
                      <VStack alignItems="stretch" gap="xs">
                        <LabelMedium color="content.secondary">
                          {t("fb-section")}
                        </LabelMedium>
                        <Input
                          value={r.section}
                          placeholder={t("fb-section-placeholder")}
                          onChange={(e) =>
                            updateRemark(i, { section: e.target.value })
                          }
                          maxLength={200}
                        />
                      </VStack>
                    </SimpleGrid>
                    <VStack alignItems="stretch" gap="xs">
                      <LabelMedium color="content.secondary">
                        {t("fb-comment")}
                      </LabelMedium>
                      <Textarea
                        rows={4}
                        value={r.comment}
                        onChange={(e) =>
                          updateRemark(i, { comment: e.target.value })
                        }
                        onPaste={(e) => {
                          const images = Array.from(e.clipboardData.files);
                          if (images.length) {
                            e.preventDefault();
                            addFiles(i, images);
                          }
                        }}
                        maxLength={5000}
                      />
                    </VStack>
                    <VStack alignItems="stretch" gap="xs">
                      <LabelMedium color="content.secondary">
                        {t("fb-suggestion")}
                      </LabelMedium>
                      <Textarea
                        rows={2}
                        value={r.suggestion}
                        onChange={(e) =>
                          updateRemark(i, { suggestion: e.target.value })
                        }
                        maxLength={5000}
                      />
                    </VStack>
                    <VStack alignItems="stretch" gap="s">
                      <LabelMedium color="content.secondary">
                        {t("fb-screenshots")}
                      </LabelMedium>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        onChange={(e) => {
                          if (e.target.files) addFiles(i, e.target.files);
                          e.target.value = "";
                        }}
                      />
                      <BodySmall color="content.tertiary">
                        {t("fb-screenshots-hint")}
                      </BodySmall>
                      {r.files.length > 0 && (
                        <HStack gap="m" flexWrap="wrap">
                          {r.files.map((f, n) => (
                            <Box key={`${f.name}-${n}`} position="relative">
                              <Image
                                src={URL.createObjectURL(f)}
                                alt={f.name}
                                maxH="120px"
                                borderRadius="rounded"
                                borderWidth="1px"
                                borderColor="border.neutral"
                              />
                              <MeedButton
                                variant="text"
                                minW="auto"
                                px="xs"
                                aria-label={t("fb-remove")}
                                onClick={() =>
                                  updateRemark(i, {
                                    files: r.files.filter((_, k) => k !== n),
                                  })
                                }
                                _focusVisible={FOCUS_RING}
                              >
                                <Icon as={LuX} boxSize="14px" />
                              </MeedButton>
                            </Box>
                          ))}
                        </HStack>
                      )}
                    </VStack>
                    {remarks.length > 1 && (
                      <MeedButton
                        variant="text"
                        minW="auto"
                        px="0"
                        alignSelf="flex-start"
                        onClick={() =>
                          setRemarks((prev) => prev.filter((_, j) => j !== i))
                        }
                        _focusVisible={FOCUS_RING}
                      >
                        {t("fb-remove")}
                      </MeedButton>
                    )}
                  </VStack>
                </Card.Body>
              </Card.Root>
            ))}
            <MeedButton
              variant="outlined"
              minW="auto"
              px="l"
              alignSelf="flex-start"
              leftIcon={<Icon as={LuPlus} boxSize="16px" />}
              onClick={() => setRemarks((prev) => [...prev, emptyRemark()])}
              _focusVisible={FOCUS_RING}
            >
              {t("fb-add-comment")}
            </MeedButton>
          </VStack>

          <VStack alignItems="flex-end" gap="s">
            {status === "error" && (
              <BodyMedium color="sentiment.negativeDefault">
                {t("fb-error")}
              </BodyMedium>
            )}
            {status === "nothing" && (
              <BodyMedium color="sentiment.warningFg">
                {t("fb-nothing")}
              </BodyMedium>
            )}
            <MeedButton
              variant="filled"
              minW="auto"
              px="l"
              leftIcon={<Icon as={LuSend} boxSize="16px" />}
              disabled={status === "sending" || shotCount > MAX_SHOTS}
              onClick={submit}
              _focusVisible={FOCUS_RING}
            >
              {status === "sending" ? t("fb-submitting") : t("fb-submit")}
            </MeedButton>
          </VStack>
        </>
      )}
    </Box>
  );
}
