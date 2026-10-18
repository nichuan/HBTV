export type VideoCard = {
  id: number;
  name: string;
  cover: string;
  year: number;
  area: string;
  remark: string;
  category: string;
  brief: string;
};

export type Episode = {
  title: string;
  episode: number;
  season: number;
  source: string;
  sourceName: string;
  path: string;
  vip: boolean;
};

export type VideoDetail = VideoCard & {
  actor: string;
  director: string;
  intro: string;
  episodes: Episode[];
};
