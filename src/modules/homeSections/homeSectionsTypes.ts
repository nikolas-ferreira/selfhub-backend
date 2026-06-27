export type HomeSectionType = "BANNER_CAROUSEL" | "PRODUCT_CAROUSEL";
export type HomeSectionDisplayStyle = "CARD" | "CIRCLE" | "FEATURED";

export interface HomeBannerSlideInput {
  id: string;
  imageUrl: string;
  badgeText?: string | null;
  title?: string | null;
  subtitle?: string | null;
  ctaLabel?: string | null;
  ctaProductId?: string | null;
  ctaCategoryId?: string | null;
}

export interface HomeCarouselItemInput {
  id: string;
  productId: string;
  badgeText?: string | null;
  compareAtPrice?: number | null;
}

export interface HomeSectionInput {
  id: string;
  type: HomeSectionType;
  title?: string | null;
  displayStyle?: HomeSectionDisplayStyle | null;
  isActive: boolean;
  banners?: HomeBannerSlideInput[];
  items?: HomeCarouselItemInput[];
}
