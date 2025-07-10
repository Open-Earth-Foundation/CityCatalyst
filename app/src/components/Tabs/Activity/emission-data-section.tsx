import React, { useState } from "react";
import { Box, Button, Card, Icon, IconButton, Text } from "@chakra-ui/react";
import { convertKgToTonnes, getInputMethodology } from "@/util/helpers";
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
import { MdAdd, MdMoreVert } from "react-icons/md";
import { FaNetworkWired } from "react-icons/fa";
import { FiTrash2 } from "react-icons/fi";
import { REGIONALLOCALES } from "@/util/constants";
import { useParams } from "next/navigation";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";

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
  const [selectedActivityValue, setSelectedActivityValue] = useState<
    ActivityValue | undefined
  >();
  const [selectedActivity, setSelectedActivity] = useState<
    SuggestedActivity | undefined
  >();
  const [hasActivityData, setHasActivityData] = useState<boolean>(
    activityValues.length > 0,
  );

  // Change Methodology Dialog
  const [openChangeMethodology, setOpenChangeMethodology] = useState(false);
  const handleChangeMethodology = () => {
    setOpenChangeMethodology(true);
  };

  // Add Activity Dialog
  const [openActivityDataDialog, setAddActivityDataDialogOpen] =
    useState(false);
  const handleActivityAddDataDialog = () => {
    setAddActivityDataDialogOpen(true);
  };

  // Delete Activity Dialog
  const [openActivityDeleteDialog, setActivityDeleteDataDialogOpen] =
    useState(false);
  const handleDeleteActivityDataDialog = (activity: ActivityValue) => {
    setSelectedActivityValue(activity);
    setActivityDeleteDataDialogOpen(true);
  };

  // Delete all activities dialog
  const [openActivityDeleteAllDialog, setActivityDeleteAllDataDialogOpen] =
    useState(false);
  const handleDeleteAllActivityDataDialog = () => {
    setActivityDeleteAllDataDialogOpen(true);
  };

  const changeMethodologyFunc = () => {
    changeMethodology();
    setOpenChangeMethodology(false);
  };

  const closeModals = () => {
    setSelectedActivityValue(undefined);
    setAddActivityDataDialogOpen(false);
    setActivityDeleteAllDataDialogOpen(false);
    setActivityDeleteDataDialogOpen(false);
  };

  const handleActivityAdded = (suggestedActivity?: SuggestedActivity) => {
    setSelectedActivity(suggestedActivity);
    setAddActivityDataDialogOpen(true);
  };

  const onEditActivity = (activity: ActivityValue) => {
    setSelectedActivityValue(activity);
    setAddActivityDataDialogOpen(true);
  };

  const { lng } = useParams();
  const { isFrozenCheck } = useOrganizationContext();

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
            {suggestedActivities.map((suggestedActivity, i) => {
              const { id, prefills } = suggestedActivity;
              return (
                <SuggestedActivityCard
                  key={`${id}-${i}`}
                  id={id}
                  prefillKey={prefills[0]?.key}
                  prefillValue={prefills[0]?.value}
                  t={t}
                  isSelected={selectedActivity?.id === id}
                  onActivityAdded={() =>
                    isFrozenCheck()
                      ? null
                      : handleActivityAdded(suggestedActivity)
                  }
                />
              );
            })}
          </Box>
        </>
      ) : (
        <Card.Root
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
            onClick={() => (isFrozenCheck() ? null : handleActivityAdded())}
            data-testid="add-emission-data-button"
            title={t("add-emission-data")}
            h="48px"
            aria-label="activity-button"
            fontSize="button.md"
            gap="8px"
          >
            <Icon as={MdAdd} h="16px" w="16px" />
            {t("add-emission-data-btn")}
          </Button>
        </Card.Root>
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
            {activityValues.length > 0 && (
              <Button
                data-testid="add-emission-data-button"
                onClick={() =>
                  isFrozenCheck() ? null : handleActivityAddDataDialog()
                }
                title="Add Activity"
                h="48px"
                aria-label="activity-button"
                fontSize="button.md"
                gap="8px"
              >
                <Icon as={MdAdd} h="16px" w="16px" />
                {t("add-emission-data")}
              </Button>
            )}
            <MenuRoot>
              <MenuTrigger>
                <IconButton
                  aria-label="more-icon"
                  variant="ghost"
                  color="content.tertiary"
                >
                  <MdMoreVert size="lg" />
                </IconButton>
              </MenuTrigger>
              <MenuContent p="0px" w="auto">
                {" "}
                <MenuItem
                  value="change-methodology"
                  value-text={t("change-methodology")}
                  p="16px"
                  display="flex"
                  alignItems="center"
                  gap="16px"
                  _hover={{
                    bg: "content.link",
                    cursor: "pointer",
                  }}
                  className="group"
                  onClick={() =>
                    isFrozenCheck() ? null : handleChangeMethodology()
                  }
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
                    fontSize="body.lg"
                  >
                    {t("change-methodology")}
                  </Text>
                </MenuItem>
                {activityValues.length > 0 && (
                  <MenuItem
                    value="delete-all-activities"
                    value-text={t("delete-all-activities")}
                    p="16px"
                    display="flex"
                    alignItems="center"
                    gap="16px"
                    _hover={{
                      bg: "content.link",
                      cursor: "pointer",
                    }}
                    className="group"
                    onClick={() =>
                      isFrozenCheck()
                        ? null
                        : handleDeleteAllActivityDataDialog()
                    }
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
                      fontSize="body.lg"
                    >
                      {t("delete-all-activities")}
                    </Text>
                  </MenuItem>
                )}
              </MenuContent>
            </MenuRoot>
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
                    onDeleteActivity={handleDeleteActivityDataDialog}
                    onEditActivity={onEditActivity}
                    showActivityModal={handleActivityAdded}
                  />
                ) : (
                  <ActivityAccordion
                    t={t}
                    referenceNumber={refNumberWithScope}
                    activityData={activityValues}
                    showActivityModal={handleActivityAdded}
                    methodologyId={methodology?.id}
                    onDeleteActivity={handleDeleteActivityDataDialog}
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
                      {convertKgToTonnes(
                        inventoryValue?.co2eq as bigint,
                        null,
                        REGIONALLOCALES[lng as string],
                      )}
                    </Text>
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
        </Box>

        <ActivityFormModal
          t={t}
          isOpen={openActivityDataDialog}
          onClose={() => setAddActivityDataDialogOpen(false)}
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
          setAddActivityDialogOpen={setAddActivityDataDialogOpen}
        />
        <ChangeMethodology
          t={t}
          onClose={() => setOpenChangeMethodology(false)}
          isOpen={openChangeMethodology}
          onChangeClicked={changeMethodologyFunc}
          gpcReferenceNumber={refNumberWithScope}
          inventoryId={inventoryId}
          setChangeMethodology={setOpenChangeMethodology}
        />
        <DeleteAllActivitiesModal
          t={t}
          isOpen={openActivityDeleteAllDialog}
          onClose={() => setActivityDeleteAllDataDialogOpen(false)}
          inventoryId={inventoryId}
          subsectorId={subsectorId}
          setDeleteActivityAllDialogOpen={setActivityDeleteAllDataDialogOpen}
        />
        <DeleteActivityModal
          t={t}
          isOpen={openActivityDeleteDialog}
          onClose={() => setActivityDeleteDataDialogOpen(false)}
          selectedActivityValue={selectedActivityValue as ActivityValue}
          inventoryId={inventoryId}
          resetSelectedActivityValue={() => setSelectedActivityValue(undefined)}
          setDeleteActivityDialogOpen={setActivityDeleteDataDialogOpen}
        />
      </Box>
    </>
  );
};

export default EmissionDataSection;
