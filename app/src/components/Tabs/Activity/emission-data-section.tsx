import React, { useState } from "react";
import {
  Box,
  Button,
  Card,
  Icon,
  IconButton,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import { convertKgToTonnes, getInputMethodology } from "@/util/helpers";
import { AddIcon } from "@chakra-ui/icons";
import SuggestedActivityCard from "@/components/Cards/suggested-activities-card";
import { DataConnectIcon } from "@/components/icons";
import DirectMeasureTable from "@/components/Tabs/Activity/direct-measure-table";
import ActivityAccordion from "@/components/Tabs/Activity/activity-accordion";
import ActivityFormModal from "@/components/Modals/activity-modal/activity-form-modal";
import ChangeMethodology from "@/components/Modals/change-methodology";
import DeleteAllActivitiesModal from "@/components/Modals/delete-all-activities-modal";
import DeleteActivityModal from "@/components/Modals/delete-activity-modal";
import { TFunction } from "i18next";
import {
  DirectMeasure,
  Methodology,
  SuggestedActivity,
} from "@/util/form-schema";
import { ActivityValue } from "@/models/ActivityValue";
import { InventoryValue } from "@/models/InventoryValue";
import HeadingText from "@/components/heading-text";
import { MdMoreVert } from "react-icons/md";
import { FaNetworkWired } from "react-icons/fa";
import { FiTrash2 } from "react-icons/fi";

interface EmissionDataSectionProps {
  t: TFunction;
  methodology?: Methodology | DirectMeasure;
  inventoryId: string;
  subsectorId: string;
  refNumberWithScope: string;
  activityValues: ActivityValue[];
  suggestedActivities: SuggestedActivity[];
  totalEmissions: number;
  changeMethodology: () => void;
  inventoryValue: InventoryValue | null;
}

const EmissionDataSection = ({
  t,
  methodology,
  inventoryId,
  subsectorId,
  refNumberWithScope,
  activityValues,
  suggestedActivities,
  totalEmissions,
  changeMethodology,
  inventoryValue,
}: EmissionDataSectionProps) => {
  const [selectedActivityValue, setSelectedActivityValue] =
    useState<ActivityValue>();
  const [selectedActivity, setSelectedActivity] = useState<
    SuggestedActivity | undefined
  >();
  const [hasActivityData, setHasActivityData] = useState<boolean>(
    activityValues.length > 0,
  );

  const {
    isOpen: isAddActivityModalOpen,
    onOpen: onAddActivityModalOpen,
    onClose: onAddActivityModalClose,
  } = useDisclosure();
  const {
    isOpen: isChangeMethodologyModalOpen,
    onOpen: onChangeMethodologyOpen,
    onClose: onChangeMethodologyClose,
  } = useDisclosure();
  const {
    isOpen: isDeleteActivitiesModalOpen,
    onOpen: onDeleteActivitiesModalOpen,
    onClose: onDeleteActivitiesModalClose,
  } = useDisclosure();
  const {
    isOpen: isDeleteActivityModalOpen,
    onOpen: onDeleteActivityModalOpen,
    onClose: onDeleteActivityModalClose,
  } = useDisclosure();

  const changeMethodologyFunc = () => {
    changeMethodology();
    onChangeMethodologyClose();
  };

  const closeModals = () => {
    setSelectedActivityValue(undefined);
    onAddActivityModalClose();
    onDeleteActivitiesModalClose();
    onDeleteActivityModalClose();
  };

  const handleActivityAdded = (suggestedActivity: SuggestedActivity) => {
    setSelectedActivity(suggestedActivity);
    onAddActivityModalOpen();
  };

  const onDeleteActivity = (activity: ActivityValue) => {
    setSelectedActivityValue(activity);
    onDeleteActivityModalOpen();
  };

  const onEditActivity = (activity: ActivityValue) => {
    setSelectedActivityValue(activity);
    onAddActivityModalOpen();
  };

  const renderSuggestedActivities = () => (
    <>
      {suggestedActivities.length ? (
        <>
          <Text
            fontFamily="heading"
            fontSize="title.md"
            fontWeight="semibold"
            color="content.secondary"
          >
            {t("activity-suggestion")}
          </Text>
          <Box className="flex flex-col gap-4">
            {suggestedActivities.map((suggestedActivity) => {
              const { id, prefills } = suggestedActivity;
              return (
                <SuggestedActivityCard
                  key={id}
                  id={id}
                  prefillKey={prefills[0]?.key}
                  prefillValue={prefills[0]?.value}
                  t={t}
                  isSelected={selectedActivity?.id === id}
                  onActivityAdded={() => handleActivityAdded(suggestedActivity)}
                />
              );
            })}
          </Box>
        </>
      ) : (
        <Card
          w="full"
          bg="background.backgroundLight"
          shadow="none"
          h="100px"
          flexDir="row"
          p="24px"
          justifyContent="space-between"
        >
          <Box display="flex" gap="12px">
            <DataConnectIcon />
            <Box display="flex" flexDir="column" gap="8px">
              <Text
                color="interactive.secondary"
                fontSize="title.md"
                fontWeight="bold"
                lineHeight="24px"
                fontFamily="heading"
              >
                {t("add-emissions-data-title")}
              </Text>
              <Text
                color="content.tertiary"
                fontSize="body.md"
                fontWeight="semibold"
                lineHeight="20px"
                letterSpacing="wide"
              >
                {t("add-emissions-data-subtext")}
              </Text>
            </Box>
          </Box>
          <Button
            onClick={onAddActivityModalOpen}
            data-testid="add-emission-data-button"
            title={t("add-emission-data")}
            leftIcon={<AddIcon h="16px" w="16px" />}
            h="48px"
            aria-label="activity-button"
            fontSize="button.md"
            gap="8px"
          >
            {t("add-emission-data-btn")}
          </Button>
        </Card>
      )}
    </>
  );

  return (
    <>
      <Box>
        <Text
          fontFamily="heading"
          fontSize="10px"
          fontWeight="semibold"
          letterSpacing="widest"
          textTransform="uppercase"
          color="content.tertiary"
        >
          {t("methodology")}
        </Text>
        <Box display="flex" justifyContent="space-between">
          <Box>
            <HeadingText title={t(methodology?.id || "")} />
            <Text
              letterSpacing="wide"
              fontSize="body.lg"
              fontWeight="normal"
              color="interactive.control"
            >
              {t(methodology?.id + "-description")}
            </Text>
          </Box>
          <Box display="flex" alignItems="center">
            {(activityValues.length > 0 ||
              getInputMethodology(methodology?.id!)) !== "direct-measure" && (
              <Button
                data-testid="add-emission-data-button"
                onClick={onAddActivityModalOpen}
                title="Add Activity"
                leftIcon={<AddIcon h="16px" w="16px" />}
                h="48px"
                aria-label="activity-button"
                fontSize="button.md"
                gap="8px"
              >
                {t("add-emission-data")}
              </Button>
            )}
            <Popover>
              <PopoverTrigger>
                <IconButton
                  icon={<MdMoreVert size="24px" />}
                  aria-label="more-icon"
                  variant="ghost"
                  color="content.tertiary"
                />
              </PopoverTrigger>
              <PopoverContent w="auto" borderRadius="8px" shadow="2dp" px="0">
                <PopoverArrow />
                <PopoverBody p="0px">
                  <Box
                    p="16px"
                    display="flex"
                    alignItems="center"
                    gap="16px"
                    _hover={{
                      bg: "content.link",
                      cursor: "pointer",
                    }}
                    className="group"
                    onClick={onChangeMethodologyOpen}
                  >
                    <Icon
                      className="group-hover:text-white"
                      color="interactive.control"
                      as={FaNetworkWired}
                      h="24px"
                      w="24px"
                    />
                    <Text
                      className="group-hover:text-white"
                      color="content.primary"
                    >
                      {t("change-methodology")}
                    </Text>
                  </Box>
                  {activityValues.length > 0 && (
                    <Box
                      p="16px"
                      display="flex"
                      alignItems="center"
                      gap="16px"
                      _hover={{
                        bg: "content.link",
                        cursor: "pointer",
                      }}
                      className="group"
                      onClick={onDeleteActivitiesModalOpen}
                    >
                      <Icon
                        className="group-hover:text-white"
                        color="sentiment.negativeDefault"
                        as={FiTrash2}
                        h="24px"
                        w="24px"
                      />
                      <Text
                        className="group-hover:text-white"
                        color="content.primary"
                      >
                        {t("delete-all-activities")}
                      </Text>
                    </Box>
                  )}
                </PopoverBody>
              </PopoverContent>
            </Popover>
          </Box>
        </Box>
        <Box>
          {/* Suggested Activities and Activities Card Logic */}
          <Box mt="48px" display="flex" flexDirection="column" gap="16px">
            {activityValues.length === 0 ? (
              renderSuggestedActivities()
            ) : (
              <Box>
                {getInputMethodology(methodology?.id!) === "direct-measure" ? (
                  <DirectMeasureTable
                    t={t}
                    referenceNumber={refNumberWithScope}
                    activityData={activityValues}
                    onDeleteActivity={onDeleteActivity}
                    onEditActivity={onEditActivity}
                    showActivityModal={onAddActivityModalOpen}
                  />
                ) : (
                  <ActivityAccordion
                    t={t}
                    referenceNumber={refNumberWithScope}
                    activityData={activityValues}
                    showActivityModal={onAddActivityModalOpen}
                    methodologyId={methodology?.id}
                    onDeleteActivity={onDeleteActivity}
                    onEditActivity={onEditActivity}
                  />
                )}
                {/* Total Emissions Section */}
                <Box
                  w="full"
                  borderTopWidth="3px"
                  borderColor="interactive.secondary"
                  py="32px"
                  px="48px"
                >
                  <Box display="flex" justifyContent="space-between">
                    <Text
                      fontFamily="heading"
                      fontWeight="semibold"
                      fontSize="headline.md"
                    >
                      {t("total-emissions")}
                    </Text>
                    <Text
                      fontFamily="heading"
                      fontWeight="semibold"
                      fontSize="headline.md"
                    >
                      {convertKgToTonnes(inventoryValue?.co2eq as bigint)}
                    </Text>
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
        </Box>

        <ActivityFormModal
          t={t}
          isOpen={isAddActivityModalOpen}
          onClose={onAddActivityModalClose}
          hasActivityData={hasActivityData}
          setHasActivityData={setHasActivityData}
          methodology={methodology!}
          inventoryId={inventoryId}
          inventoryValue={inventoryValue}
          selectedActivity={selectedActivity}
          referenceNumber={refNumberWithScope}
          edit={!!selectedActivityValue}
          targetActivityValue={selectedActivityValue as ActivityValue}
          resetSelectedActivityValue={() => setSelectedActivityValue(undefined)}
        />
        <ChangeMethodology
          t={t}
          onClose={onChangeMethodologyClose}
          isOpen={isChangeMethodologyModalOpen}
          onChangeClicked={changeMethodologyFunc}
          gpcReferenceNumber={refNumberWithScope}
          inventoryId={inventoryId}
        />
        <DeleteAllActivitiesModal
          t={t}
          isOpen={isDeleteActivitiesModalOpen}
          onClose={onDeleteActivitiesModalClose}
          inventoryId={inventoryId}
          subsectorId={subsectorId}
        />
        <DeleteActivityModal
          t={t}
          isOpen={isDeleteActivityModalOpen}
          onClose={onDeleteActivityModalClose}
          selectedActivityValue={selectedActivityValue as ActivityValue}
          inventoryId={inventoryId}
          resetSelectedActivityValue={() => setSelectedActivityValue(undefined)}
        />
      </Box>
    </>
  );
};

export default EmissionDataSection;
