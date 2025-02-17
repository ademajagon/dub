"use client";

import { createRewardAction } from "@/lib/actions/partners/create-reward";
import { updateRewardAction } from "@/lib/actions/partners/update-reward";
import { handleMoneyInputChange, handleMoneyKeyDown } from "@/lib/form-utils";
import { mutatePrefix } from "@/lib/swr/mutate";
import usePartners from "@/lib/swr/use-partners";
import useProgram from "@/lib/swr/use-program";
import useRewards from "@/lib/swr/use-rewards";
import useWorkspace from "@/lib/swr/use-workspace";
import { Reward } from "@/lib/types";
import {
  createRewardSchema,
  RECURRING_MAX_DURATIONS,
} from "@/lib/zod/schemas/rewards";
import { SelectEligiblePartnersSheet } from "@/ui/partners/select-eligible-partners-sheet";
import { X } from "@/ui/shared/icons";
import { EventType } from "@dub/prisma/client";
import {
  AnimatedSizeContainer,
  Button,
  CircleCheckFill,
  Sheet,
  Table,
  Users,
  useTable,
} from "@dub/ui";
import { cn, pluralize } from "@dub/utils";
import { DICEBEAR_AVATAR_URL } from "@dub/utils/src/constants";
import { useAction } from "next-safe-action/hooks";
import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { mutate } from "swr";
import { z } from "zod";

interface RewardSheetProps {
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  event: EventType;
  reward?: Reward;
}

type FormData = z.infer<typeof createRewardSchema>;

const partnerTypes = [
  {
    key: "all",
    label: "All Partners",
    description: "Everyone is eligible",
  },
  {
    key: "specific",
    label: "Specific Partners",
    description: "Select who is eligible",
  },
] as const;

const commissionTypes = [
  {
    label: "One-off",
    description: "Pay a one-time payout",
    recurring: false,
  },
  {
    label: "Recurring",
    description: "Pay an ongoing payout",
    recurring: true,
  },
];

function RewardSheetContent({ setIsOpen, event, reward }: RewardSheetProps) {
  const { program } = useProgram();
  const { rewards } = useRewards();
  const { data: partners } = usePartners();
  const { id: workspaceId } = useWorkspace();
  const formRef = useRef<HTMLFormElement>(null);
  const [isAddPartnersOpen, setIsAddPartnersOpen] = useState(false);
  const [isRecurring, setIsRecurring] = useState(reward?.maxDuration !== 0);

  const [selectedPartnerType, setSelectedPartnerType] = useState<
    (typeof partnerTypes)[number]["key"]
  >(reward?.partnersCount === 0 || event === "sale" ? "specific" : "all");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      event,
      type: reward?.type || "flat",
      maxDuration: reward?.maxDuration
        ? (reward.maxDuration.toString() as (typeof RECURRING_MAX_DURATIONS)[number])
        : "0",
      amount:
        reward?.type === "flat" ? reward.amount / 100 : reward?.amount || 0,
      //  partnerIds: reward?.partnersCount === 0 ? null : reward?.partners?.map((p) => p.partnerId) || null,
    },
  });

  const [partnerIds = [], amount, type, maxDuration] = watch([
    "partnerIds",
    "amount",
    "type",
    "maxDuration",
  ]);

  const { executeAsync: createReward, isPending: isCreating } = useAction(
    createRewardAction,
    {
      onSuccess: async () => {
        setIsOpen(false);
        toast.success("Reward created!");
        await mutate(`/api/programs/${program?.id}`);
        await mutatePrefix(`/api/programs/${program?.id}/rewards`);
      },
      onError({ error }) {
        toast.error(error.serverError);
        console.error(error);
      },
    },
  );

  const { executeAsync: updateReward, isPending: isUpdating } = useAction(
    updateRewardAction,
    {
      onSuccess: async () => {
        setIsOpen(false);
        toast.success("Reward updated!");
        await mutate(`/api/programs/${program?.id}`);
        await mutatePrefix(`/api/programs/${program?.id}/rewards`);
      },
      onError({ error }) {
        toast.error(error.serverError);
        console.error(error);
      },
    },
  );

  const onSubmit = async (data: FormData) => {
    if (!workspaceId || !program) {
      return;
    }

    const payload = {
      ...data,
      workspaceId,
      programId: program.id,
      amount: type === "flat" ? data.amount * 100 : data.amount,
      ...(event === "sale"
        ? {
            maxDuration: maxDuration === "0" ? null : maxDuration, // TODO: Fix it
          }
        : {
            maxDuration: undefined,
          }),
    };

    if (!reward) {
      await createReward(payload);
    } else {
      await updateReward({
        ...payload,
        rewardId: reward.id,
      });
    }
  };

  useEffect(() => {
    setIsRecurring(maxDuration === "0" ? false : true);
  }, [maxDuration]);

  const selectedPartnersTable = useTable({
    data: partners?.filter((p) => partnerIds?.includes(p.id)) || [],
    columns: [
      {
        header: "Partner",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <img
              src={
                row.original.image ||
                `${DICEBEAR_AVATAR_URL}${row.original.name}`
              }
              alt={row.original.name}
              className="size-6 rounded-full"
            />
            <span className="text-sm text-neutral-700">
              {row.original.name}
            </span>
          </div>
        ),
      },
      {
        header: "Email",
        cell: ({ row }) => (
          <div className="text-sm text-neutral-600">{row.original.email}</div>
        ),
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              variant="secondary"
              icon={<X className="size-4" />}
              className="h-8 w-8 rounded-md border-0 bg-neutral-50 p-0"
              onClick={() => {
                setValue(
                  "partnerIds",
                  (partnerIds || []).filter((id) => id !== row.original.id),
                );
              }}
            />
          </div>
        ),
        size: 50,
      },
    ],
    thClassName: () => cn("border-l-0"),
    tdClassName: () => cn("border-l-0"),
    className: "[&_tr:last-child>td]:border-b-transparent",
    scrollWrapperClassName: "min-h-[40px]",
    resourceName: (p) => `eligible partner${p ? "s" : ""}`,
  });

  const buttonDisabled = isCreating || isUpdating || amount == null;
  const hasDefaultReward = !!program?.defaultRewardId;
  const displayAddPartnerButton =
    (event !== "sale" && selectedPartnerType === "specific") ||
    (event === "sale" && hasDefaultReward);

  const hasAllPartnerClickReward = rewards?.some(
    (reward) => reward.event === "click" && reward.partnersCount === 0,
  );

  const hasAllPartnerLeadReward = rewards?.some(
    (reward) => reward.event === "lead" && reward.partnersCount === 0,
  );

  const hasAllPartnerSaleReward = rewards?.some(
    (reward) => reward.event === "sale" && reward.partnersCount === 0,
  );

  return (
    <>
      <form
        ref={formRef}
        onSubmit={handleSubmit(onSubmit)}
        className="flex h-full flex-col"
      >
        <div>
          <div className="flex items-start justify-between border-b border-neutral-200 p-6">
            <Sheet.Title className="text-xl font-semibold">
              {reward ? "Edit" : "Create"}{" "}
              {!program?.defaultRewardId && event === "sale" ? "default" : ""}{" "}
              {event} reward
            </Sheet.Title>
            <Sheet.Close asChild>
              <Button
                variant="outline"
                icon={<X className="size-5" />}
                className="h-auto w-fit p-1"
              />
            </Sheet.Close>
          </div>
          <div className="flex flex-col gap-4 p-6">
            {event !== "sale" && (
              <div>
                <label className="text-sm font-medium text-neutral-800">
                  {`Amount per ${event}`}
                </label>
                <div className="relative mt-2 rounded-md shadow-sm">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-neutral-400">
                    $
                  </span>
                  <input
                    className={cn(
                      "block w-full rounded-md border-neutral-300 pl-6 pr-12 text-neutral-900 placeholder-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-neutral-500 sm:text-sm",
                      errors.amount &&
                        "border-red-600 focus:border-red-500 focus:ring-red-600",
                    )}
                    {...register("amount", {
                      required: true,
                      valueAsNumber: true,
                      min: 0,
                      max: 1000,
                      onChange: handleMoneyInputChange,
                    })}
                    onKeyDown={handleMoneyKeyDown}
                  />
                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-neutral-400">
                    USD
                  </span>
                </div>
              </div>
            )}

            {event !== "sale" && (
              <div className="mt-2">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {partnerTypes.map((partnerType) => {
                    const isSelected = selectedPartnerType === partnerType.key;

                    return (
                      <label
                        key={partnerType.label}
                        className={cn(
                          "relative flex w-full cursor-pointer items-start gap-0.5 rounded-md border border-neutral-200 bg-white p-3 text-neutral-600 hover:bg-neutral-50",
                          "transition-all duration-150",
                          isSelected &&
                            "border-black bg-neutral-50 text-neutral-900 ring-1 ring-black",
                        )}
                      >
                        <input
                          type="radio"
                          value={partnerType.label}
                          className="hidden"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPartnerType(partnerType.key);

                              if (partnerType.key === "all") {
                                setValue("partnerIds", null);
                              }
                            }
                          }}
                        />
                        <div className="flex grow flex-col text-sm">
                          <span className="font-medium">
                            {partnerType.label}
                          </span>
                          <span>{partnerType.description}</span>
                        </div>
                        <CircleCheckFill
                          className={cn(
                            "-mr-px -mt-px flex size-4 scale-75 items-center justify-center rounded-full opacity-0 transition-[transform,opacity] duration-150",
                            isSelected && "scale-100 opacity-100",
                          )}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {event === "sale" && (
              <>
                <div>
                  <label className="text-sm font-medium text-neutral-800">
                    Commission
                  </label>
                  <p className="mb-4 text-sm text-neutral-600">
                    Set how the affiliate will get rewarded
                  </p>
                  <div className="-m-1">
                    <AnimatedSizeContainer
                      height
                      transition={{ ease: "easeInOut", duration: 0.2 }}
                    >
                      <div className="p-1">
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                          {commissionTypes.map(
                            ({ label, description, recurring }) => {
                              const isSelected = isRecurring === recurring;

                              return (
                                <label
                                  key={label}
                                  className={cn(
                                    "relative flex w-full cursor-pointer items-start gap-0.5 rounded-md border border-neutral-200 bg-white p-3 text-neutral-600 hover:bg-neutral-50",
                                    "transition-all duration-150",
                                    isSelected &&
                                      "border-black bg-neutral-50 text-neutral-900 ring-1 ring-black",
                                  )}
                                >
                                  <input
                                    type="radio"
                                    value={label}
                                    className="hidden"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setIsRecurring(recurring);

                                        if (!recurring) {
                                          setValue("maxDuration", "0");
                                        }
                                      }
                                    }}
                                  />
                                  <div className="flex grow flex-col text-sm">
                                    <span className="font-medium">{label}</span>
                                    <span>{description}</span>
                                  </div>
                                  <CircleCheckFill
                                    className={cn(
                                      "-mr-px -mt-px flex size-4 scale-75 items-center justify-center rounded-full opacity-0 transition-[transform,opacity] duration-150",
                                      isSelected && "scale-100 opacity-100",
                                    )}
                                  />
                                </label>
                              );
                            },
                          )}
                        </div>

                        <div
                          className={cn(
                            "transition-opacity duration-200",
                            isRecurring ? "h-auto" : "h-0 opacity-0",
                          )}
                          aria-hidden={!isRecurring}
                          {...{
                            inert: !isRecurring,
                          }}
                        >
                          <div className="pt-6">
                            <label
                              htmlFor="duration"
                              className="text-sm font-medium text-neutral-800"
                            >
                              Duration
                            </label>
                            <div className="relative mt-2 rounded-md shadow-sm">
                              <select
                                className="block w-full rounded-md border-neutral-300 text-neutral-900 focus:border-neutral-500 focus:outline-none focus:ring-neutral-500 sm:text-sm"
                                {...register("maxDuration")}
                              >
                                {RECURRING_MAX_DURATIONS.filter(
                                  (v) => v !== "0",
                                ).map((v) => (
                                  <option value={v} key={v}>
                                    {v} {pluralize("month", Number(v))}
                                  </option>
                                ))}
                                <option value="">Lifetime</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    </AnimatedSizeContainer>
                  </div>
                </div>

                <div className="mt-6">
                  <label className="text-sm font-medium text-neutral-800">
                    Payout
                  </label>
                  <p className="mb-4 text-sm text-neutral-600">
                    Set how much the affiliate will get rewarded
                  </p>
                  <div className="flex flex-col gap-6">
                    <div>
                      <label
                        htmlFor="type"
                        className="text-sm font-medium text-neutral-800"
                      >
                        Payout model
                      </label>
                      <div className="relative mt-2 rounded-md shadow-sm">
                        <select
                          className="block w-full rounded-md border-neutral-300 text-neutral-900 focus:border-neutral-500 focus:outline-none focus:ring-neutral-500 sm:text-sm"
                          {...register("type", { required: true })}
                        >
                          <option value="flat">Flat</option>
                          <option value="percentage">Percentage</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="amount"
                        className="text-sm font-medium text-neutral-800"
                      >
                        Amount
                      </label>
                      <div className="relative mt-2 rounded-md shadow-sm">
                        {type === "flat" && (
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-neutral-400">
                            $
                          </span>
                        )}
                        <input
                          className={cn(
                            "block w-full rounded-md border-neutral-300 text-neutral-900 placeholder-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-neutral-500 sm:text-sm",
                            errors.amount &&
                              "border-red-600 focus:border-red-500 focus:ring-red-600",
                            type === "flat" ? "pl-6 pr-12" : "pr-7",
                          )}
                          {...register("amount", {
                            required: true,
                            valueAsNumber: true,
                            min: 0,
                            max: type === "flat" ? 1000 : 100,
                            onChange: handleMoneyInputChange,
                          })}
                          onKeyDown={handleMoneyKeyDown}
                        />
                        <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-neutral-400">
                          {type === "flat" ? "USD" : "%"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {displayAddPartnerButton && (
              <div className="mt-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-neutral-800">
                    Eligible partners
                  </label>
                  <Button
                    text="Add partner"
                    className="h-7 w-fit"
                    onClick={() => setIsAddPartnersOpen(true)}
                  />
                </div>
                <div className="mt-4">
                  {(partnerIds || []).length > 0 ? (
                    <Table {...selectedPartnersTable} />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-4 rounded-lg bg-neutral-50 py-12">
                      <div className="flex items-center justify-center">
                        <Users className="size-6 text-neutral-800" />
                      </div>
                      <div className="flex flex-col items-center gap-1 px-4 text-center">
                        <p className="text-base font-medium text-neutral-900">
                          Eligible partners
                        </p>
                        <p className="text-sm text-neutral-600">
                          No eligible partners added yet
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex grow flex-col justify-end">
          <div className="flex items-center justify-end gap-2 border-t border-neutral-200 p-5">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsOpen(false)}
              text="Cancel"
              className="w-fit"
              disabled={isCreating || isUpdating}
            />
            <Button
              type="submit"
              variant="primary"
              text={reward ? "Save changes" : "Create reward"}
              className="w-fit"
              loading={isCreating || isUpdating}
              disabled={buttonDisabled}
            />
          </div>
        </div>
      </form>

      <SelectEligiblePartnersSheet
        isOpen={isAddPartnersOpen}
        setIsOpen={setIsAddPartnersOpen}
        selectedPartnerIds={partnerIds || []}
        onSelect={(ids) => {
          setValue("partnerIds", ids);
        }}
      />
    </>
  );
}

export function RewardSheet({
  isOpen,
  nested,
  ...rest
}: RewardSheetProps & {
  isOpen: boolean;
  nested?: boolean;
}) {
  return (
    <Sheet open={isOpen} onOpenChange={rest.setIsOpen} nested={nested}>
      <RewardSheetContent {...rest} />
    </Sheet>
  );
}

export function useRewardSheet(
  props: { nested?: boolean } & Omit<RewardSheetProps, "setIsOpen">,
) {
  const [isOpen, setIsOpen] = useState(false);

  return {
    RewardSheet: (
      <RewardSheet setIsOpen={setIsOpen} isOpen={isOpen} {...props} />
    ),
    setIsOpen,
  };
}
