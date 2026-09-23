"use client";
import React, { useEffect, useState } from "react";
import { Box, Card, HStack, Image, Link, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { HeadlineSmall } from "@/components/package/Texts/Headline";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { LabelLarge, LabelMedium } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { MeedStatusTag } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import type { HiapDemoScreenshot } from "@/models/HiapDemoFeedback";
import { useDemoT } from "../../_lib/useDemoT";

interface Row {
  id: string;
  reviewerName: string | null;
  organisation: string | null;
  kind: string;
  screenId: string | null;
  section: string | null;
  category: string | null;
  priority: string | null;
  comment: string | null;
  suggestion: string | null;
  answers: Record<string, string> | null;
  screenshots: HiapDemoScreenshot[] | null;
  lang: string | null;
  created: string;
}

/** Admin view of everything reviewers sent. Needs a signed-in admin. */
export default function ResponsesPage(props: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = React.use(props.params);
  const { t } = useDemoT(lng);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    fetch("/api/v1/hiap-demo/feedback", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          setDenied(true);
          return;
        }
        const body = await res.json();
        setRows(body.data ?? []);
      })
      .catch(() => setDenied(true));
  }, []);

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
      gap="l"
    >
      <HeadlineSmall color="content.primary">
        {t("fb-responses-title")}
      </HeadlineSmall>
      {denied ? (
        <VStack alignItems="flex-start" gap="s">
          <BodyMedium color="content.secondary">
            {t("fb-responses-signin")}
          </BodyMedium>
          <Link
            asChild
            color="content.link"
            fontFamily="heading"
            fontSize="label.md"
            fontWeight="semibold"
            _focusVisible={FOCUS_RING}
          >
            <NextLink href={`/${lng}/auth/login`}>
              {t("fb-responses-signin")}
            </NextLink>
          </Link>
        </VStack>
      ) : rows === null ? null : rows.length === 0 ? (
        <BodyMedium color="content.secondary">
          {t("fb-responses-empty")}
        </BodyMedium>
      ) : (
        rows.map((r) => (
          <Card.Root key={r.id} borderColor="border.overlay">
            <Card.Body p="l">
              <VStack alignItems="stretch" gap="m">
                <HStack justifyContent="space-between" gap="m" flexWrap="wrap">
                  <HStack gap="s" flexWrap="wrap">
                    <LabelLarge color="content.primary">
                      {r.reviewerName || t("fb-responses-anonymous")}
                    </LabelLarge>
                    {r.organisation && (
                      <BodyMedium color="content.secondary">
                        {r.organisation}
                      </BodyMedium>
                    )}
                    {r.kind === "comment" && r.screenId && (
                      <MeedStatusTag tone="info">{r.screenId}</MeedStatusTag>
                    )}
                    {r.kind === "comment" && r.category && (
                      <MeedStatusTag tone="neutral">
                        {t(`fb-cat-${r.category}`)}
                      </MeedStatusTag>
                    )}
                    {r.kind === "comment" && r.priority && (
                      <MeedStatusTag
                        tone={
                          r.priority === "blocker"
                            ? "negative"
                            : r.priority === "important"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {t(`fb-pri-${r.priority}`)}
                      </MeedStatusTag>
                    )}
                  </HStack>
                  <BodySmall color="content.tertiary">
                    {new Date(r.created).toLocaleString(lng)}
                  </BodySmall>
                </HStack>
                {r.kind === "answers" ? (
                  <VStack alignItems="stretch" gap="m">
                    <Overline color="content.tertiary">
                      {t("fb-responses-answers")}
                    </Overline>
                    {Object.entries(r.answers ?? {})
                      .filter(([, v]) => v.trim())
                      .map(([k, v]) => (
                        <VStack key={k} alignItems="stretch" gap="xs">
                          <LabelMedium color="content.primary">
                            {t(k)}
                          </LabelMedium>
                          <BodyMedium
                            color="content.secondary"
                            whiteSpace="pre-wrap"
                          >
                            {v}
                          </BodyMedium>
                        </VStack>
                      ))}
                  </VStack>
                ) : (
                  <VStack alignItems="stretch" gap="m">
                    {r.section && (
                      <Overline color="content.tertiary">{r.section}</Overline>
                    )}
                    {r.comment && (
                      <BodyMedium color="content.primary" whiteSpace="pre-wrap">
                        {r.comment}
                      </BodyMedium>
                    )}
                    {r.suggestion && (
                      <VStack alignItems="stretch" gap="xs">
                        <LabelMedium color="content.secondary">
                          {t("fb-suggestion")}
                        </LabelMedium>
                        <BodyMedium
                          color="content.secondary"
                          whiteSpace="pre-wrap"
                        >
                          {r.suggestion}
                        </BodyMedium>
                      </VStack>
                    )}
                    {(r.screenshots ?? []).length > 0 && (
                      <HStack gap="m" flexWrap="wrap">
                        {(r.screenshots ?? []).map((s) => (
                          <Link
                            key={s.key}
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            _focusVisible={FOCUS_RING}
                          >
                            <Image
                              src={s.url}
                              alt={s.filename}
                              maxH="160px"
                              borderRadius="rounded"
                              borderWidth="1px"
                              borderColor="border.neutral"
                            />
                          </Link>
                        ))}
                      </HStack>
                    )}
                  </VStack>
                )}
              </VStack>
            </Card.Body>
          </Card.Root>
        ))
      )}
    </Box>
  );
}
