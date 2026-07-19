export type ListingMode = "fixed_price" | "accept_offers" | "swap" | "giveaway" | "recycle";

export type ListingFormValues = {
  title: string;
  category: string;
  brand: string;
  conditionLevel: string;
  functionStatus: string;
  description: string;
  cityName: string;
  modes: ListingMode[];
  primaryMode: ListingMode;
  price: string;
  minAcceptPrice: string;
  swapIntent: string;
  giveawayRule: "first_come" | "apply" | "choose";
};

export function validateListingForm(values: ListingFormValues) {
  if (values.title.trim().length < 2) return "请填写至少 2 个字的物品名称";
  if (values.description.trim().length < 5) return "请用至少 5 个字说明物品状况";
  if (!values.category.trim()) return "请选择物品分类";
  if (!values.conditionLevel.trim() || !values.functionStatus.trim()) return "请选择物品成色和功能状态";
  if (values.cityName.trim().length < 2) return "请填写所在城市或地区";
  if (values.modes.length === 0) return "请至少选择一种交易方式";
  if (!values.modes.includes(values.primaryMode)) return "请选择有效的主要交易方式";
  if (values.modes.includes("fixed_price") && !positiveInteger(values.price)) return "一口价必须是大于 0 的整元金额";
  if (values.minAcceptPrice.trim() && !positiveInteger(values.minAcceptPrice)) return "最低可接受价必须是大于 0 的整元金额";
  if (values.modes.includes("swap") && values.swapIntent.trim().length < 2) return "请说明希望交换的物品";
  return null;
}

function positiveInteger(value: string) {
  return /^[1-9]\d*$/.test(value.trim());
}

export function listingFormPayload(values: ListingFormValues) {
  return {
    title: values.title.trim(),
    category: values.category,
    brand: values.brand.trim() || undefined,
    conditionLevel: values.conditionLevel,
    functionStatus: values.functionStatus,
    description: values.description.trim(),
    cityName: values.cityName.trim(),
    modes: values.modes,
    primaryMode: values.modes.includes(values.primaryMode) ? values.primaryMode : values.modes[0],
    price: values.price.trim() ? Number(values.price) : null,
    minAcceptPrice: values.minAcceptPrice.trim() ? Number(values.minAcceptPrice) : null,
    swapIntent: values.swapIntent.trim() || undefined,
    giveawayRule: values.modes.includes("giveaway") ? values.giveawayRule : null,
  };
}
